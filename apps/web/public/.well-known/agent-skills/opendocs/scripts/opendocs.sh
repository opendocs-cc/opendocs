#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# OpenDocs without Node.js: publish Markdown with curl + jq.
#
#   bash opendocs.sh login --email you@example.com          # emails a 6-digit code
#   bash opendocs.sh login --email you@example.com --code 123456
#   bash opendocs.sh publish notes.md                        # again later = update
#   bash opendocs.sh publish notes.md --anonymous            # no account, 24h link
#
# Uses the same config (~/.config/opendocs/config.json) and folder state
# (.opendocs/state.json) as the `opendocs` npm CLI, so switching to the CLI
# later keeps your login and your file → document mapping. Results are
# printed to stdout as one JSON object; progress goes to stderr.
# Local images are not uploaded (use the npm CLI for that).

set -euo pipefail

OPENDOCS_SH_VERSION="1.1.0"
API_URL="${OPENDOCS_API_URL:-https://api.opendocs.cc}"
WEB_URL="${OPENDOCS_WEB_URL:-https://opendocs.cc}"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opendocs"
CONFIG_FILE="$CONFIG_DIR/config.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# How to re-run this script in hints. `bash` works even when an installer
# (e.g. `npx skills add`) didn't keep the executable bit.
SELF="bash $SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")"

if command -v jq >/dev/null 2>&1; then
  JQ="jq"
elif [ -x "$SCRIPT_DIR/../bin/jq" ]; then
  JQ="$SCRIPT_DIR/../bin/jq"
else
  echo "error: jq is required. Re-run the installer: curl -fsSL https://opendocs.cc/install.sh | bash" >&2
  exit 1
fi
command -v curl >/dev/null 2>&1 || { echo "error: curl is required" >&2; exit 1; }

# ── helpers ─────────────────────────────────────────────────────────────

die() {
  local code="$1"; shift
  "$JQ" -cn --arg error "$code" --arg message "$*" '{error: $error, message: $message}' >&2
  exit 1
}

info() { echo "$*" >&2; }

detect_client() {
  if [ -n "${OPENDOCS_CLIENT:-}" ]; then echo "$OPENDOCS_CLIENT"; return; fi
  if [ "${CLAUDECODE:-}" = "1" ] || [ -n "${CLAUDE_CODE_ENTRYPOINT:-}" ]; then echo "claude-code/opendocs-sh"; return; fi
  if [ -n "${CURSOR_AGENT:-}${CURSOR_TRACE_ID:-}" ]; then echo "cursor/opendocs-sh"; return; fi
  if [ -n "${CODEX_SANDBOX:-}${CODEX_MANAGED_BY_NPM:-}" ]; then echo "codex/opendocs-sh"; return; fi
  if [ -n "${GEMINI_CLI:-}" ]; then echo "gemini/opendocs-sh"; return; fi
  echo "opendocs-sh"
}
CLIENT="$(detect_client)"

config_get() {
  [ -f "$CONFIG_FILE" ] || return 0
  "$JQ" -r --arg k "$1" '.[$k] // empty' "$CONFIG_FILE"
}

API_KEY="${OPENDOCS_API_KEY:-$(config_get apiKey)}"

sha256() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  else sha256sum "$1" | awk '{print $1}'; fi
}

# Scratch space for request bodies and the last HTTP status. Commands run
# api calls inside $(...) subshells, so the status travels through a file.
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/opendocs.XXXXXX")"
trap 'rm -rf "$WORK_DIR"' EXIT
STATUS_FILE="$WORK_DIR/status"

tmpfile() { mktemp "$WORK_DIR/body.XXXXXX"; }
last_status() { cat "$STATUS_FILE" 2>/dev/null || echo 0; }

# api METHOD PATH [BODY_FILE] → response body on stdout. Exits with the
# server's {error, message} on 4xx/5xx unless ALLOW_ERROR=1, in which case
# the body is returned; read the status with last_status.
api() {
  local method="$1" path="$2" body="${3:-}"
  local out status
  local args=(-sS -X "$method" "$API_URL$path"
    -H "Content-Type: application/json"
    -H "User-Agent: opendocs-sh/$OPENDOCS_SH_VERSION"
    -H "X-OpenDocs-Client: $CLIENT"
    -w $'\n%{http_code}')
  if [ -n "$API_KEY" ]; then args+=(-H "Authorization: Bearer $API_KEY"); fi
  if [ -n "$body" ]; then args+=(--data-binary "@$body"); fi
  out="$(curl "${args[@]}")" || die network_error "Could not reach $API_URL"
  status="${out##*$'\n'}"
  out="${out%$'\n'*}"
  printf '%s' "$status" > "$STATUS_FILE"
  if [ "$status" -ge 400 ] && [ "${ALLOW_ERROR:-0}" != "1" ]; then
    local code message
    code="$(printf '%s' "$out" | "$JQ" -r '.error // "api_error"' 2>/dev/null || echo api_error)"
    message="$(printf '%s' "$out" | "$JQ" -r '.message // empty' 2>/dev/null || true)"
    die "$code" "${message:-Request failed with status $status}"
  fi
  printf '%s' "$out"
}

require_login() {
  if [ -z "$API_KEY" ]; then
    die not_logged_in "Not signed in. Sign up free in one step: $SELF login --email you@example.com (a 6-digit code is emailed). Just need a throwaway link? $SELF publish <file> --anonymous makes one that lasts 24 hours."
  fi
}

# ── folder state (.opendocs/state.json, shared with the npm CLI) ────────

find_state_root() {
  local dir="$PWD"
  while :; do
    if [ -f "$dir/.opendocs/state.json" ]; then echo "$dir"; return; fi
    if [ "$dir" = "/" ] || [ "$dir" = "$HOME" ]; then break; fi
    dir="$(dirname "$dir")"
  done
  echo "$PWD"
}
STATE_ROOT="$(find_state_root)"
STATE_FILE="$STATE_ROOT/.opendocs/state.json"

state_read() {
  if [ -f "$STATE_FILE" ]; then cat "$STATE_FILE"; else echo '{"version":1,"docs":{},"anonymous":{}}'; fi
}

# state_update JQ_FILTER [jq args...] — applies a filter to state.json.
state_update() {
  local filter="$1"; shift
  local next
  next="$(state_read | "$JQ" "$@" "$filter")"
  mkdir -p "$STATE_ROOT/.opendocs"
  [ -f "$STATE_ROOT/.opendocs/.gitignore" ] || printf '# Local OpenDocs sync state (contains claim tokens)\n*\n' > "$STATE_ROOT/.opendocs/.gitignore"
  (umask 077; printf '%s\n' "$next" > "$STATE_FILE.tmp")
  mv "$STATE_FILE.tmp" "$STATE_FILE"
}

state_key() {
  local abs
  abs="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
  case "$abs" in
    "$STATE_ROOT"/*) echo "${abs#"$STATE_ROOT"/}" ;;
    *) echo "$abs" ;;
  esac
}

# A post ID/slug, or a local .md file this folder published.
resolve_doc() {
  local ref="$1"
  if [ -f "$ref" ]; then
    local id
    id="$(state_read | "$JQ" -r --arg k "$(state_key "$ref")" '.docs[$k].postId // empty')"
    if [ -n "$id" ]; then echo "$id"; return; fi
  fi
  echo "$ref"
}

save_config_from() {
  # $1 = JSON with apiKey, userId, username, workspace{id,name,slug}, defaultProject{...}
  mkdir -p "$CONFIG_DIR"
  (umask 077; printf '%s' "$1" | "$JQ" --arg apiUrl "$API_URL" '{
    apiKey, apiUrl: $apiUrl, userId, username,
    workspaceId: .workspace.id, workspaceName: .workspace.name, workspaceSlug: .workspace.slug,
    projectId: .defaultProject.id, projectName: .defaultProject.name, projectSlug: .defaultProject.slug
  } | with_entries(select(.value != null))' > "$CONFIG_FILE.tmp")
  mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
  API_KEY="$(config_get apiKey)"
}

# Claims anonymous docs recorded in this folder into the active workspace.
claim_tracked() {
  local ws project keys key token body res
  ws="$(config_get workspaceId)"; project="$(config_get projectId)"
  keys="$(state_read | "$JQ" -r '.anonymous | keys[]')"
  [ -n "$keys" ] || { echo "[]"; return; }
  local results="[]"
  while IFS= read -r key; do
    token="$(state_read | "$JQ" -r --arg k "$key" '.anonymous[$k].claimToken')"
    body="$(tmpfile)"
    "$JQ" -n --arg t "$token" --arg ws "$ws" --arg p "$project" \
      '{claimToken: $t, workspaceId: $ws} + (if $p != "" then {projectId: $p} else {} end)' > "$body"
    res="$(ALLOW_ERROR=1 api POST /api/v1/anonymous/claim "$body")"
    local status; status="$(last_status)"
    if [ "$status" -lt 400 ]; then
      state_update '.docs[$k] = {postId: $r.postId, slug: $r.slug, url: $r.url, workspaceId: $ws,
          projectSlug: $r.projectSlug, versionNumber: $r.versionNumber,
          localHash: .anonymous[$k].localHash, syncedAt: (now | todate)} | del(.anonymous[$k])' \
        --arg k "$key" --arg ws "$ws" --argjson r "$res"
      info "✔ Claimed $key → $WEB_URL$(printf '%s' "$res" | "$JQ" -r .url)"
      results="$(printf '%s' "$results" | "$JQ" -c --arg k "$key" --argjson r "$res" '. + [{file: $k, success: true, postId: $r.postId, url: $r.url}]')"
    else
      if [ "$status" = "404" ] || [ "$status" = "410" ]; then state_update 'del(.anonymous[$k])' --arg k "$key"; fi
      results="$(printf '%s' "$results" | "$JQ" -c --arg k "$key" --argjson r "$res" '. + [{file: $k, success: false, error: $r.error, message: $r.message}]')"
    fi
  done <<< "$keys"
  echo "$results"
}

# ── commands ────────────────────────────────────────────────────────────

cmd_login() {
  local email="" code="" key="" key_name=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --email) email="$2"; shift 2 ;;
      --code) code="$2"; shift 2 ;;
      --key) key="$2"; shift 2 ;;
      --key-name) key_name="$2"; shift 2 ;;
      *) die invalid_option "Unknown option for login: $1" ;;
    esac
  done
  local body res
  body="$(tmpfile)"
  if [ -n "$key" ]; then
    API_KEY="$key"
    res="$(api GET /api/v1/me)"
    save_config_from "$(printf '%s' "$res" | "$JQ" --arg k "$key" '{apiKey: $k, userId, username: .onboarding.username,
      workspace: .onboarding.workspace, defaultProject: .onboarding.workspace.defaultProject}')"
    info "✔ Logged in as $(config_get username) · workspace: $(config_get workspaceName)"
    "$JQ" -cn --arg u "$(config_get username)" --arg w "$(config_get workspaceSlug)" '{success: true, username: $u, workspaceSlug: $w}'
    return
  fi
  [ -n "$email" ] || die missing_email "Usage: $SELF login --email you@example.com [--code 123456] | --key od_live_..."
  if [ -z "$code" ]; then
    "$JQ" -n --arg e "$email" '{email: $e}' > "$body"
    res="$(API_KEY="" api POST /api/v1/auth/code/request "$body")"
    info "✔ Sent a 6-digit sign-in code to $email. Ask the user to paste it, then run:"
    info "  $SELF login --email $email --code <code>"
    printf '%s' "$res" | "$JQ" -c --arg next "$SELF login --email $email --code <6-digit code from the email>" \
      '{status: "code_sent", email, accountExists, expiresInSeconds, next: $next}'
    return
  fi
  "$JQ" -n --arg e "$email" --arg c "$code" --arg n "${key_name:-${CLIENT%%/*}}" '{email: $e, code: $c, keyName: $n}' > "$body"
  res="$(API_KEY="" api POST /api/v1/auth/code/verify "$body")"
  save_config_from "$res"
  if [ "$(printf '%s' "$res" | "$JQ" -r .accountCreated)" = "true" ]; then
    info "✔ Account created as $(config_get username) · workspace: $(config_get workspaceName) ($WEB_URL/$(config_get workspaceSlug))"
  else
    info "✔ Signed in as $(config_get username) · workspace: $(config_get workspaceName)"
  fi
  local claimed
  claimed="$(claim_tracked)"
  printf '%s' "$res" | "$JQ" -c --argjson claimed "$claimed" \
    '{success: true, accountCreated, email, username, workspaceSlug: .workspace.slug, keyName, claimed: $claimed}'
}

cmd_whoami() {
  require_login
  api GET /api/v1/me | "$JQ" -c --arg ws "$(config_get workspaceSlug)" --arg p "$(config_get projectSlug)" \
    '{userId, username: .onboarding.username, activeWorkspace: $ws, activeProject: $p, quota: .quota.documents}'
}

publish_one() {
  # $1 file. Uses the option globals set by cmd_publish. Echoes one JSON result.
  local file="$1" key hash body res existing
  key="$(state_key "$file")"
  hash="$(sha256 "$file")"
  body="$(tmpfile)"

  if [ "$ANONYMOUS" = "1" ]; then
    existing="$(state_read | "$JQ" -c --arg k "$key" \
      '.anonymous[$k] // empty | select((.expiresAt | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601) > now)')"
    if [ -n "$existing" ]; then
      "$JQ" -n --rawfile md "$file" --arg t "$TITLE" --argjson e "$existing" \
        '{markdown: $md, claimToken: $e.claimToken} + (if $t != "" then {title: $t} else {} end)' > "$body"
      res="$(api PUT "/api/v1/anonymous/$(printf '%s' "$existing" | "$JQ" -r .id)" "$body")"
      res="$(printf '%s' "$res" | "$JQ" -c --argjson e "$existing" '. + {claimToken: $e.claimToken, claimUrl: $e.claimUrl, action: "updated"}')"
    else
      "$JQ" -n --rawfile md "$file" --arg t "$TITLE" '{markdown: $md} + (if $t != "" then {title: $t} else {} end)' > "$body"
      res="$(API_KEY="" api POST /api/v1/anonymous/publish "$body" | "$JQ" -c '. + {action: "created"}')"
    fi
    state_update '.anonymous[$k] = {id: $r.id, url: $r.url, claimToken: $r.claimToken, claimUrl: $r.claimUrl, expiresAt: $r.expiresAt, localHash: $h}' \
      --arg k "$key" --arg h "$hash" --argjson r "$res"
    info "✔ $key → $(printf '%s' "$res" | "$JQ" -r .url)  (anonymous, expires $(printf '%s' "$res" | "$JQ" -r .expiresAt))"
    info "  Sign up free to keep it: $SELF login --email you@example.com (run it in this folder)"
    info "  Claim to keep it: $(printf '%s' "$res" | "$JQ" -r .claimUrl)"
    printf '%s' "$res" | "$JQ" -c --arg f "$key" '{file: $f, success: true, action, anonymous: true, id, url, claimUrl, expiresAt}'
    return
  fi

  require_login
  local ws tracked
  ws="$(config_get workspaceId)"
  tracked="$(state_read | "$JQ" -c --arg k "$key" '.docs[$k] // empty')"
  if [ -n "$tracked" ] && [ "$NEW" != "1" ]; then
    local post_id
    post_id="$(printf '%s' "$tracked" | "$JQ" -r .postId)"
    "$JQ" -n --rawfile md "$file" --argjson tr "$tracked" --arg t "$TITLE" --arg v "$VISIBILITY" \
      --arg tags "$TAGS" --arg cp "$CONFIRM_PUBLIC" --arg force "$FORCE" \
      '{markdown: $md, workspaceId: $tr.workspaceId}
       + (if $t != "" then {title: $t} else {} end)
       + (if $v != "" then {visibility: $v} else {} end)
       + (if $tags != "" then {tags: ($tags | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0)))} else {} end)
       + (if $cp == "1" then {confirmPublic: true} else {} end)
       + (if $force == "1" then {} else {baseVersionNumber: $tr.versionNumber} end)' > "$body"
    res="$(ALLOW_ERROR=1 api POST "/api/v1/posts/$post_id/update?workspaceId=$(printf '%s' "$tracked" | "$JQ" -r .workspaceId)" "$body")"
    local status; status="$(last_status)"
    if [ "$status" = "409" ]; then
      info "⚠ $key: someone published v$(printf '%s' "$res" | "$JQ" -r .currentVersionNumber) since your copy. Compare with: $SELF pull $key --stdout — then re-run with --force to overwrite."
      printf '%s' "$res" | "$JQ" -c --arg f "$key" '{file: $f, success: false, action: "conflict", error, message, currentVersionNumber}'
      return
    fi
    if [ "$status" -ge 400 ]; then
      printf '%s' "$res" | "$JQ" -c --arg f "$key" '{file: $f, success: false, action: "failed", error, message}'
      info "✖ $key: $(printf '%s' "$res" | "$JQ" -r '.message // .error')"
      return
    fi
    state_update '.docs[$k] += {slug: $r.slug, url: ($r.url // .docs[$k].url), versionNumber: $r.versionNumber, localHash: $h, syncedAt: (now | todate)}' \
      --arg k "$key" --arg h "$hash" --argjson r "$res"
    local action url
    action="$(printf '%s' "$res" | "$JQ" -r 'if .unchanged then "unchanged" else "updated" end')"
    url="$WEB_URL$(state_read | "$JQ" -r --arg k "$key" '.docs[$k].url')"
    info "✔ $key $action (v$(printf '%s' "$res" | "$JQ" -r .versionNumber)) → $url"
    printf '%s' "$res" | "$JQ" -c --arg f "$key" --arg a "$action" --arg u "$url" '{file: $f, success: true, action: $a, postId, url: $u, versionNumber}'
    return
  fi

  # Folder → project link (opendocs project link), unless --project was given.
  local linked=""
  if [ -z "$PROJECT" ]; then
    linked="$(state_read | "$JQ" -r --arg ws "$ws" 'select((.workspaceId // $ws) == $ws) | .project.id // empty')"
  fi
  "$JQ" -n --rawfile md "$file" --arg ws "$ws" --arg t "$TITLE" --arg v "${VISIBILITY:-workspace}" \
    --arg tags "$TAGS" --arg cp "$CONFIRM_PUBLIC" --arg p "$PROJECT" --arg lp "$linked" --arg src "$key" \
    '{markdown: $md, workspaceId: $ws, visibility: $v, sourcePath: $src,
      tags: (if $tags != "" then ($tags | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0))) else [] end)}
     + (if $t != "" then {title: $t} else {} end)
     + (if $p != "" then {projectSlug: $p} elif $lp != "" then {projectId: $lp} else {} end)
     + (if $cp == "1" then {confirmPublic: true} else {} end)' > "$body"
  res="$(ALLOW_ERROR=1 api POST /api/v1/publish "$body")"
  if [ "$(last_status)" -ge 400 ]; then
    info "✖ $key: $(printf '%s' "$res" | "$JQ" -r '.message // .error')"
    printf '%s' "$res" | "$JQ" -c --arg f "$key" '{file: $f, success: false, action: "failed", error, message}'
    return
  fi
  state_update '.docs[$k] = {postId: $r.postId, slug: $r.slug, url: $r.url, workspaceId: $ws, projectId: $r.projectId,
      projectSlug: $r.projectSlug, versionNumber: ($r.versionNumber // 1), localHash: $h, syncedAt: (now | todate)}
    | .workspaceId //= $ws' --arg k "$key" --arg h "$hash" --arg ws "$ws" --argjson r "$res"
  info "✔ $key → $WEB_URL$(printf '%s' "$res" | "$JQ" -r .url)"
  printf '%s' "$res" | "$JQ" -c --arg f "$key" --arg w "$WEB_URL" '{file: $f, success: true, action: "created", postId, url: ($w + .url), versionNumber}'
}

cmd_publish() {
  ANONYMOUS=0; NEW=0; FORCE=0; CONFIRM_PUBLIC=0; TITLE=""; VISIBILITY=""; TAGS=""; PROJECT=""
  local files=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --anonymous) ANONYMOUS=1; shift ;;
      --new) NEW=1; shift ;;
      --force) FORCE=1; shift ;;
      --confirm-public) CONFIRM_PUBLIC=1; shift ;;
      --title) TITLE="$2"; shift 2 ;;
      --visibility) VISIBILITY="$2"; shift 2 ;;
      --tags) TAGS="$2"; shift 2 ;;
      --project) PROJECT="$2"; shift 2 ;;
      -*) die invalid_option "Unknown option for publish: $1" ;;
      *)
        if [ -d "$1" ]; then
          while IFS= read -r f; do files+=("$f"); done < <(find "$1" -type f -name '*.md' \
            -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/.obsidian/*' -not -path '*/.opendocs/*' | sort)
        else
          files+=("$1")
        fi
        shift ;;
    esac
  done
  [ "${#files[@]}" -gt 0 ] || die missing_files "Usage: $SELF publish <file.md|folder>... [--anonymous] [--title T] [--visibility private|workspace|public] [--confirm-public] [--tags a,b] [--project slug] [--new] [--force]"
  if [ "$VISIBILITY" = "public" ] && [ "$CONFIRM_PUBLIC" != "1" ]; then
    die confirm_public_required "Public publishing needs --confirm-public. Only use it if the user explicitly asked for a public page."
  fi
  if [ "$ANONYMOUS" = "1" ] && [ "${#files[@]}" -gt 10 ]; then
    die too_many_files "Anonymous publishing is limited to 10 files at a time. Sign in to publish more."
  fi
  local results="[]" f r
  for f in "${files[@]}"; do
    [ -f "$f" ] || die file_not_found "No such file: $f"
    r="$(publish_one "$f")"
    results="$(printf '%s' "$results" | "$JQ" -c --argjson r "$r" '. + [$r]')"
  done
  printf '%s' "$results" | "$JQ" -c '{total: length, succeeded: (map(select(.success)) | length), failed: (map(select(.success | not)) | length), results: .}'
  printf '%s' "$results" | "$JQ" -e 'all(.success)' >/dev/null
}

cmd_list() {
  require_login
  local project="" ws qs
  while [ $# -gt 0 ]; do
    case "$1" in
      --project) project="$2"; shift 2 ;;
      *) die invalid_option "Unknown option for list: $1" ;;
    esac
  done
  ws="$(config_get workspaceId)"; qs="workspaceId=$ws&limit=100"
  if [ -n "$project" ]; then
    local pid
    pid="$(api GET "/api/v1/projects?workspaceId=$ws" | "$JQ" -r --arg p "$project" '.projects[] | select(.slug == $p or .id == $p or .name == $p) | .id' | head -1)"
    [ -n "$pid" ] || die project_not_found "Project \"$project\" not found."
    qs="$qs&projectId=$pid"
  fi
  api GET "/api/v1/posts?$qs" | "$JQ" -c --arg w "$WEB_URL" \
    '{total: .pagination.total, posts: [.posts[] | {id, slug, title, visibility, versionNumber, updatedAt, project: .projectSlug,
      url: ($w + "/" + .workspaceSlug + (if .isDefaultProject then "" else "/projects/" + .projectSlug end) + "/" + .slug)}]}'
}

cmd_pull() {
  require_login
  local doc="" output="" stdout=0
  while [ $# -gt 0 ]; do
    case "$1" in
      -o|--output) output="$2"; shift 2 ;;
      --stdout) stdout=1; shift ;;
      *) doc="$1"; shift ;;
    esac
  done
  [ -n "$doc" ] || die missing_argument "Usage: $SELF pull <doc> [-o file.md | --stdout]"
  local res id
  id="$(resolve_doc "$doc")"
  res="$(api GET "/api/v1/posts/$id/raw?workspaceId=$(config_get workspaceId)")"
  if [ "$stdout" = "1" ]; then printf '%s' "$res" | "$JQ" -r .markdown; return; fi
  [ -n "$output" ] || output="$(printf '%s' "$res" | "$JQ" -r .slug).md"
  printf '%s' "$res" | "$JQ" -j .markdown > "$output"
  local key
  key="$(state_key "$output")"
  if state_read | "$JQ" -e --arg k "$key" --arg id "$(printf '%s' "$res" | "$JQ" -r .postId)" '.docs[$k].postId == $id' >/dev/null; then
    state_update '.docs[$k] += {versionNumber: $v, localHash: $h, syncedAt: (now | todate)}' \
      --arg k "$key" --argjson v "$(printf '%s' "$res" | "$JQ" .versionNumber)" --arg h "$(sha256 "$output")"
  fi
  info "✔ Saved $output (v$(printf '%s' "$res" | "$JQ" -r .versionNumber))"
  printf '%s' "$res" | "$JQ" -c --arg o "$output" '{success: true, postId, path: $o, versionNumber}'
}

cmd_history() {
  require_login
  [ $# -ge 1 ] || die missing_argument "Usage: $SELF history <doc>"
  api GET "/api/v1/posts/$(resolve_doc "$1")/versions?workspaceId=$(config_get workspaceId)"
}

cmd_share() {
  require_login
  [ $# -ge 1 ] || die missing_argument "Usage: $SELF share <doc> [email|@domain]... [--remove]"
  local id remove=0 emails="" domains="" p
  id="$(resolve_doc "$1")"; shift
  for p in "$@"; do
    case "$p" in
      --remove) remove=1 ;;
      @*) domains="$domains,${p#@}" ;;
      *@*) emails="$emails,$p" ;;
      *) domains="$domains,$p" ;;
    esac
  done
  local qs="workspaceId=$(config_get workspaceId)"
  if [ -z "$emails$domains" ]; then api GET "/api/v1/posts/$id/share?$qs"; return; fi
  local body
  body="$(tmpfile)"
  "$JQ" -n --arg e "$emails" --arg d "$domains" \
    '{emails: ($e | split(",") | map(select(length > 0) | ascii_downcase)), domains: ($d | split(",") | map(select(length > 0) | ascii_downcase))}' > "$body"
  if [ "$remove" = "1" ]; then api DELETE "/api/v1/posts/$id/share?$qs" "$body"; else api POST "/api/v1/posts/$id/share?$qs" "$body"; fi
}

cmd_export() {
  require_login
  local doc="" format="pdf" output=""
  while [ $# -gt 0 ]; do
    case "$1" in
      -f|--format) format="$2"; shift 2 ;;
      -o|--output) output="$2"; shift 2 ;;
      *) doc="$1"; shift ;;
    esac
  done
  [ -n "$doc" ] || die missing_argument "Usage: $SELF export <doc> [--format pdf|docx] [-o file]"
  case "$format" in pdf|docx) ;; *) die invalid_format "--format must be pdf or docx" ;; esac
  if [ -z "$output" ]; then
    case "$doc" in *.md) output="${doc%.md}.$format" ;; *) output="$doc.$format" ;; esac
  fi
  local status
  status="$(curl -sS -X POST "$API_URL/api/v1/posts/$(resolve_doc "$doc")/export/$format?workspaceId=$(config_get workspaceId)" \
    -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -H "X-OpenDocs-Client: $CLIENT" \
    --data '{}' -o "$output" -w '%{http_code}')"
  if [ "$status" -ge 400 ]; then
    local err; err="$(cat "$output")"; rm -f "$output"
    die "$(printf '%s' "$err" | "$JQ" -r '.error // "export_failed"' 2>/dev/null || echo export_failed)" \
      "$(printf '%s' "$err" | "$JQ" -r '.message // "Export failed"' 2>/dev/null || echo "Export failed")"
  fi
  info "✔ Saved $output"
  "$JQ" -cn --arg o "$output" --arg f "$format" '{success: true, format: $f, path: $o}'
}

cmd_claim() {
  require_login
  if [ $# -eq 0 ]; then
    claim_tracked | "$JQ" -c '{results: .}'
    return
  fi
  local token="$1" body
  case "$token" in */claim/*) token="${token##*/claim/}"; token="${token%%[?#]*}" ;; esac
  body="$(tmpfile)"
  "$JQ" -n --arg t "$token" --arg ws "$(config_get workspaceId)" '{claimToken: $t, workspaceId: $ws}' > "$body"
  api POST /api/v1/anonymous/claim "$body"
}

cmd_team() {
  require_login
  local sub="${1:-list}"
  [ $# -gt 0 ] && shift
  local ws body
  ws="$(config_get workspaceId)"
  case "$sub" in
    list|ls)
      api GET "/api/v1/workspace/team?workspaceId=$ws" | "$JQ" -c '{members: [.members[] | {name, email, role}]}'
      ;;
    invite)
      local role="member" emails=()
      while [ $# -gt 0 ]; do
        case "$1" in
          --role) role="$2"; shift 2 ;;
          *) emails+=("$1"); shift ;;
        esac
      done
      [ "${#emails[@]}" -gt 0 ] || die missing_argument "Usage: $SELF team invite <email>... [--role admin|member]"
      local results="[]" e res
      for e in "${emails[@]}"; do
        body="$(tmpfile)"
        "$JQ" -n --arg e "$e" --arg r "$role" --arg ws "$ws" '{email: $e, role: $r, workspaceId: $ws}' > "$body"
        res="$(ALLOW_ERROR=1 api POST /api/v1/workspace/team/invite "$body")"
        if [ "$(last_status)" -lt 400 ]; then
          info "✔ Invited $e as $role — they'll get an email to accept"
          results="$(printf '%s' "$results" | "$JQ" -c --arg e "$e" '. + [{email: $e, success: true}]')"
        else
          info "✖ $e: $(printf '%s' "$res" | "$JQ" -r '.message // .error')"
          results="$(printf '%s' "$results" | "$JQ" -c --arg e "$e" --argjson r "$res" '. + [{email: $e, success: false, error: $r.error, message: $r.message}]')"
        fi
      done
      printf '%s' "$results" | "$JQ" -c '{results: .}'
      ;;
    invitations)
      api GET /api/v1/me/invitations
      ;;
    join)
      local target="${1:-}" data choice kind id res
      data="$(api GET /api/v1/me/invitations)"
      choice="$(printf '%s' "$data" | "$JQ" -c --arg t "$target" '
        ([.invitations[] | {kind: "invite", id, slug: .workspaceSlug}] + [.joinable[] | {kind: "domain", id: .workspaceId, slug: .workspaceSlug}])
        | if $t != "" then map(select(.slug == $t)) else . end
        | if length == 1 then .[0] else empty end')"
      [ -n "$choice" ] || die workspace_required "No single invitation to accept. See: $SELF team invitations — then: $SELF team join <workspace>"
      kind="$(printf '%s' "$choice" | "$JQ" -r .kind)"; id="$(printf '%s' "$choice" | "$JQ" -r .id)"
      if [ "$kind" = "invite" ]; then res="$(api POST "/api/v1/invitations/$id/accept")"
      else res="$(api POST "/api/v1/workspaces/$(printf '%s' "$choice" | "$JQ" -r .slug)/join")"; fi
      # Switch the active workspace, like the CLI does.
      (umask 077; "$JQ" --argjson r "$res" '.workspaceId = $r.workspace.id | .workspaceName = $r.workspace.name
        | .workspaceSlug = $r.workspace.slug | del(.projectId, .projectName, .projectSlug)' "$CONFIG_FILE" > "$CONFIG_FILE.tmp")
      mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
      info "✔ Joined $(printf '%s' "$res" | "$JQ" -r .workspace.name) and switched to it"
      printf '%s' "$res"
      ;;
    *) die invalid_option "Usage: $SELF team [list | invite <email>... [--role admin] | invitations | join [workspace]]" ;;
  esac
}

cmd_theme() {
  require_login
  local sub="${1:-show}"
  [ $# -gt 0 ] && shift
  local ws body
  ws="$(config_get workspaceId)"
  case "$sub" in
    show)
      api GET "/api/v1/workspace/branding?workspaceId=$ws" | "$JQ" -c '.branding + {canEdit, tier, workspace: .workspace.slug}'
      ;;
    presets)
      api GET "/api/v1/workspace/branding?workspaceId=$ws" | "$JQ" -c '{presets, current: .branding.preset}'
      ;;
    fonts)
      api GET "/api/v1/workspace/branding?workspaceId=$ws" | "$JQ" -c '{fonts: [.fonts[].id], current: .branding.font, guidelines}'
      ;;
    set)
      # Changes every PDF/DOCX export in the workspace: needs --yes, which
      # agents should only pass after their human agreed.
      local preset="" color="" font="" logo="" yes=0
      while [ $# -gt 0 ]; do
        case "$1" in
          --preset) preset="$2"; shift 2 ;;
          --color) color="$2"; shift 2 ;;
          --font) font="$2"; shift 2 ;;
          --logo-in-exports) logo="$2"; shift 2 ;;
          --yes|-y) yes=1; shift ;;
          *) die invalid_option "Usage: $SELF theme set [--preset id] [--color #hex] [--font name] [--logo-in-exports on|off] --yes" ;;
        esac
      done
      [ "$yes" = 1 ] || die confirm_required "This changes every PDF and Word export in the workspace. Ask your human, then pass --yes."
      body="$(tmpfile)"
      "$JQ" -n --arg ws "$ws" --arg p "$preset" --arg c "$color" --arg f "$font" --arg l "$logo" '
        {workspaceId: $ws}
        + (if $p != "" then {preset: $p} else {} end)
        + (if $c != "" then {brandColor: $c} else {} end)
        + (if $f != "" then {font: $f} else {} end)
        + (if $l == "on" then {showLogoInExports: true} elif $l == "off" then {showLogoInExports: false} else {} end)' > "$body"
      api PATCH /api/v1/workspace/branding "$body" | "$JQ" -c '.branding'
      info "✔ Export theme updated. Preview: $SELF export <doc> --format pdf"
      ;;
    *) die invalid_option "Usage: $SELF theme [show | presets | fonts | set ... --yes]" ;;
  esac
}

usage() {
  cat >&2 <<EOF
opendocs.sh $OPENDOCS_SH_VERSION — OpenDocs with only curl + jq (no Node.js)

  login --email <email> [--code <code>]   Sign in or create an account with an emailed code
  login --key od_live_...                 Use an existing API key
  whoami                                  Account, active workspace and quota
  publish <files|folder>... [options]     Publish; files this folder published are updated
      --anonymous  --title T  --visibility private|workspace|public  --confirm-public
      --tags a,b  --project <slug>  --new  --force
  list [--project <slug>]                 Documents in the active workspace
  pull <doc> [-o file | --stdout]         Download Markdown
  history <doc>                           Version history
  share <doc> [email|@domain]... [--remove]
  export <doc> [--format pdf|docx] [-o file]
  claim [claim-url]                       Keep anonymous documents
  team [list]                             Workspace members
  team invite <email>... [--role admin]   Email invitations (they accept by email)
  team invitations | team join [ws]       Invitations sent to you; accept and switch
  theme [show | presets | fonts]          Export theme: brand color, font, logo, footer
  theme set --preset <id> --yes           Or --color #hex --font <name>; ask your human first

<doc> is a post ID, slug, or a local .md file this folder published.
Results are JSON on stdout. For local image uploads, folder status and
history rollback, install the full CLI: npm install -g @opendocs.cc/cli
EOF
}

main() {
  local cmd="${1:-help}"
  [ $# -gt 0 ] && shift
  case "$cmd" in
    login|signup) cmd_login "$@" ;;
    whoami) cmd_whoami ;;
    publish) cmd_publish "$@" ;;
    list|ls) cmd_list "$@" ;;
    pull) cmd_pull "$@" ;;
    history) cmd_history "$@" ;;
    share) cmd_share "$@" ;;
    export) cmd_export "$@" ;;
    claim) cmd_claim "$@" ;;
    team) cmd_team "$@" ;;
    theme) cmd_theme "$@" ;;
    version|--version|-v) echo "$OPENDOCS_SH_VERSION" ;;
    help|--help|-h) usage ;;
    *) usage; exit 1 ;;
  esac
}

main "$@"
