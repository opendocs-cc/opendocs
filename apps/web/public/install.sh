#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# OpenDocs installer for agents — no Node.js required.
#
#   curl -fsSL https://opendocs.cc/install.sh | bash
#
# Installs the OpenDocs agent skill (SKILL.md + scripts/opendocs.sh) for every
# agent it finds, in the folder each one reads (the same table as
# `opendocs agent --install`):
#   ~/.agents/skills   Codex, Cursor, GitHub Copilot, Gemini CLI, opencode,
#                      OpenClaw, Windsurf, Amp, Goose, Grok (the shared folder)
#   ~/.claude/skills   Claude Code
#   ~/.cline/skills    Cline
#   ~/.hermes/skills   Hermes Agent
#   ~/.kiro/skills     Kiro CLI
# With none of them installed, it installs for Claude Code.
# scripts/opendocs.sh publishes with curl + jq; jq is downloaded (pinned and
# checksum-verified) only if it isn't already installed.
#
# Have Node.js 22+? You can use this instead:
#   npx skills add opendocs-cc/skills --skill opendocs -g -y
#
# Overrides: OPENDOCS_SKILL_DIR (install target), OPENDOCS_BASE_URL.

set -euo pipefail

BASE_URL="${OPENDOCS_BASE_URL:-https://opendocs.cc}"
SKILL_URL="${BASE_URL}/.well-known/agent-skills/opendocs"
JQ_VERSION="1.8.1"
JQ_BASE_URL="https://github.com/jqlang/jq/releases/download/jq-${JQ_VERSION}"

die() {
  echo "error: $1" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "requires $1"
}

# Prints "<asset>|<sha256>" for this machine's jq release binary.
jq_asset_for_platform() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$os/$arch" in
    darwin/arm64) echo "jq-macos-arm64|a9fe3ea2f86dfc72f6728417521ec9067b343277152b114f4e98d8cb0e263603" ;;
    darwin/x86_64) echo "jq-macos-amd64|e80dbe0d2a2597e3c11c404f03337b981d74b4a8504b70586c354b7697a7c27f" ;;
    linux/x86_64) echo "jq-linux-amd64|020468de7539ce70ef1bceaf7cde2e8c4f2ca6c3afb84642aabc5c97d9fc2a0d" ;;
    linux/aarch64 | linux/arm64) echo "jq-linux-arm64|6bc62f25981328edd3cfcfe6fe51b073f2d7e7710d7ef7fcdac28d4e384fc3d4" ;;
    *) die "unsupported platform ${os}/${arch} for the bundled jq; install jq yourself and re-run" ;;
  esac
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$1" | awk '{print $2}'
  else
    die "no SHA-256 tool found (need sha256sum, shasum, or openssl)"
  fi
}

download() {
  local tmp
  tmp="$(mktemp "${2}.tmp.XXXXXX")"
  curl -fsSL "$1" -o "$tmp" || { rm -f "$tmp"; die "download failed: $1"; }
  mv "$tmp" "$2"
}

install_into() {
  local dir="$1"
  mkdir -p "$dir/scripts"
  download "${SKILL_URL}/SKILL.md" "$dir/SKILL.md"
  download "${SKILL_URL}/scripts/opendocs.sh" "$dir/scripts/opendocs.sh"
  chmod +x "$dir/scripts/opendocs.sh"
}

need_cmd curl
need_cmd uname
need_cmd mktemp

echo "Installing the OpenDocs skill..."

# Agents are detected by their config folders, like the CLI does.
CONFIG_HOME="${XDG_CONFIG_HOME:-${HOME}/.config}"
targets=()
add_target() {
  local dir="$1" existing
  for existing in "${targets[@]+"${targets[@]}"}"; do
    [ "$existing" = "$dir" ] && return 0
  done
  # A linked skill folder belongs to another installer (npx skills links
  # agents' folders to ~/.agents/skills): leave it alone.
  if [ -L "$dir" ]; then
    echo "skipping ${dir}: it's a link to $(readlink "$dir")"
    return 0
  fi
  targets+=("$dir")
}

if [ -n "${OPENDOCS_SKILL_DIR:-}" ]; then
  add_target "$OPENDOCS_SKILL_DIR"
else
  for dir in "${HOME}/.agents" "${CODEX_HOME:-${HOME}/.codex}" "${HOME}/.cursor" \
    "${COPILOT_HOME:-${HOME}/.copilot}" "${HOME}/.gemini" "${CONFIG_HOME}/opencode" \
    "${HOME}/.openclaw" "${HOME}/.codeium/windsurf" "${CONFIG_HOME}/amp" \
    "${CONFIG_HOME}/goose" "${GROK_HOME:-${HOME}/.grok}"; do
    if [ -d "$dir" ]; then
      add_target "${HOME}/.agents/skills/opendocs"
      break
    fi
  done
  claude_dir="${CLAUDE_CONFIG_DIR:-${HOME}/.claude}"
  [ -d "$claude_dir" ] && add_target "${claude_dir}/skills/opendocs"
  [ -d "${HOME}/.cline" ] && add_target "${HOME}/.cline/skills/opendocs"
  hermes_dir="${HERMES_HOME:-${HOME}/.hermes}"
  [ -d "$hermes_dir" ] && add_target "${hermes_dir}/skills/opendocs"
  kiro_dir="${KIRO_HOME:-${HOME}/.kiro}"
  [ -d "$kiro_dir" ] && add_target "${kiro_dir}/skills/opendocs"
  # Nothing found: install for Claude Code, as before.
  [ "${#targets[@]}" -eq 0 ] && add_target "${claude_dir}/skills/opendocs"
fi
[ "${#targets[@]}" -gt 0 ] || die "nothing to install into (every skill folder is a link)"
PRIMARY_DIR="${targets[0]}"

for dir in "${targets[@]}"; do
  install_into "$dir"
done

if command -v jq >/dev/null 2>&1 && [ "${OPENDOCS_FORCE_JQ_DOWNLOAD:-0}" != "1" ]; then
  echo "using jq at $(command -v jq)"
else
  platform="$(jq_asset_for_platform)"
  asset="${platform%|*}"
  expected="${platform#*|}"
  for dir in "${targets[@]}"; do
    mkdir -p "$dir/bin"
    download "${JQ_BASE_URL}/${asset}" "$dir/bin/jq"
    actual="$(sha256_file "$dir/bin/jq")"
    if [ "$actual" != "$expected" ]; then
      rm -f "$dir/bin/jq"
      die "jq checksum mismatch (expected ${expected}, got ${actual})"
    fi
    chmod +x "$dir/bin/jq"
  done
  echo "installed jq ${JQ_VERSION} (checksum verified)"
fi

echo ""
for dir in "${targets[@]}"; do
  echo "done - OpenDocs skill installed to ${dir}"
done
echo ""
echo "Publish without an account:  bash ${PRIMARY_DIR}/scripts/opendocs.sh publish notes.md --anonymous"
echo "Sign up with an emailed code: bash ${PRIMARY_DIR}/scripts/opendocs.sh login --email you@example.com"
if command -v npm >/dev/null 2>&1; then
  echo "Node.js detected - for local image uploads, folder status and more: npm install -g @opendocs.cc/cli"
fi
echo "Restart your agents to start using the skill."
