---
title: The OpenDocs skill
sidebar_position: 2
description: What the OpenDocs skill (SKILL.md) teaches your agent, the four ways to install it, where it lives and where to read it.
---

# The OpenDocs skill

The OpenDocs skill is a `SKILL.md` file your agent loads when you ask it to
publish, share or export a document. It holds the commands and the rules that
go with them, such as "ask before making anything public" and "never guess a
signer's email". With it installed, you say what you want in plain language
and your agent knows which `opendocs` commands to run and what to tell you
afterwards.

You rarely need to think about it: the one prompt from the
[Quickstart](quickstart.md) installs it for you. Read it any time at
[opendocs.cc/skill.md](https://opendocs.cc/skill.md).

## How it gets installed

| Way | What it installs | Use it when |
| --- | --- | --- |
| **The prompt** (**Copy prompt for agent** on opendocs.cc) | Your agent runs one of the installers below, then signs you in. | You're starting out. This is the usual path. |
| `npx skills add opendocs-cc/skills --skill opendocs -g -y` | `SKILL.md` and `scripts/opendocs.sh` from [github.com/opendocs-cc/skills](https://github.com/opendocs-cc/skills), for every agent it finds on your machine. Needs Node.js 22+. | You have Node.js and want the skill in all your agents. |
| `/plugin marketplace add opendocs-cc/skills`, then `/plugin install opendocs-cc@opendocs-cc` | The OpenDocs.cc plugin for Claude Code: the skill, the MCP server and `/opendocs-cc:publish` and `/opendocs-cc:export`, kept up to date by Claude Code. In Codex: `codex plugin marketplace add opendocs-cc/skills`, then `codex plugin add opendocs-cc@opendocs-cc`. | You use Claude Code or Codex. |
| `curl -fsSL https://opendocs.cc/install.sh \| bash` | `SKILL.md`, `scripts/opendocs.sh` and, if missing, a checksum-verified `jq`, for every agent it finds (Claude Code, Codex, Cursor, Copilot, Gemini CLI, opencode, Cline, OpenClaw, Hermes Agent and more). | There's no Node.js on the machine. |
| `opendocs agent --install [dir]` | The skill bundled with your CLI, for every agent it finds on your machine, or into the folder you name. See the [CLI reference](../cli/reference.md#opendocs-agent). | You already have the CLI, or want the skill in a specific folder or repository. |

The `npx` installer may end with
`✗ opendocs → PromptScript: PromptScript does not support global skill installation`.
That's a known installer bug that only affects PromptScript; the skill is
installed for your other agents.

Each [agent page](../integrations/overview.md) lists the folder that agent
reads skills from, and what to do for agents without skill support (print the
instructions into a rules or instructions file instead).

## What it teaches your agent

- **Signing you up.** Ask for your email, run `opendocs login --email`, ask you
  for the 6-digit code. Never run bare `opendocs login`, never ask you to copy
  API keys. Offer an anonymous 24-hour link only if you don't want an account.
- **Publishing.** Write Markdown to a file, publish it, and publish the same
  file again to update it (same link, new version). Publish folders in one
  command, not a loop. Stop on a `version_conflict` and ask you.
- **Keeping things organized.** Treat projects like branches in a repository:
  one per client, product or initiative. Check where a document will go, reuse
  existing projects, ask before creating a new one (unless you said to
  organize automatically).
- **Exports.** `publish --export pdf` for a link and a file in one step. Word
  needs Pro or Team; Free PDFs carry a "Made with OpenDocs" footer.
- **Who can see what.** Keep the default workspace visibility. Use `public`
  only when you asked for it. Share with specific people or a whole `@domain`
  instead of making a document public.
- **Teams.** Confirm the email and role before sending an invitation, and ask
  before accepting one for you.
- **Branding.** Propose a theme preset or a dark brand color and wait for your
  yes before changing it, because it changes every PDF and Word file in the
  workspace.
- **Google Drive and signatures** (Pro and Team). Save only when you ask, using
  the folder names your workspace set up. Draft a signature request, read
  every signer back, offer the draft PDF, and send only after an explicit yes.
- **What to tell you.** Each link on its own line, who can open it, the local
  path of any export, and the error message when something fails.
- **Errors and limits.** What each error code means and how to recover, and to
  let the CLI wait out rate limits instead of adding retry loops.

## Where to read it

- [opendocs.cc/skill.md](https://opendocs.cc/skill.md): the published copy.
- `opendocs agent --full`: the copy bundled with your installed CLI.
- `opendocs agent`: a short version for instruction files and small context
  windows. `--cli` and `--api` print CLI-only and API-only references.
- The installed file itself, for example `~/.claude/skills/opendocs/SKILL.md`.

## Keep it up to date

The skill changes with the CLI. To refresh it, run the install command again,
or update the CLI and reinstall from it:

```bash
npx skills add opendocs-cc/skills --skill opendocs -g -y
npm install -g @opendocs.cc/cli@latest && opendocs agent --install
```

## When to skip it

- You type `opendocs` commands yourself. See
  [Use the CLI yourself](cli-quickstart.md).
- You're calling the REST API from your own code. See
  [Authentication](../api-reference/authentication.md).
- Your agent can't load skills or instruction files. Paste the output of
  `opendocs agent` into the chat at the start of the session.

## Under the hood

`npx skills` reads the discovery index at
`https://opendocs.cc/.well-known/agent-skills/index.json`, which lists two
files: `SKILL.md` and `scripts/opendocs.sh`. No GitHub repository is involved.
`-a <agent>` limits the install to one agent:

```bash
npx skills add opendocs-cc/skills --skill opendocs -g -y -a claude-code
```

`install.sh` takes two overrides: `OPENDOCS_SKILL_DIR` (install only into that
folder) and `OPENDOCS_BASE_URL`:

```bash
curl -fsSL https://opendocs.cc/install.sh | OPENDOCS_SKILL_DIR="$HOME/.cursor/skills/opendocs" bash
```

`opendocs agent --install` writes only `SKILL.md`; the bash client isn't
needed when the CLI is installed. With `--json` it returns
`{ "installed": true, "path": "...", "version": "0.4.7" }`.

`scripts/opendocs.sh` is a bash client that needs only `curl` and `jq`. It
shares the CLI's config (`~/.config/opendocs/config.json`) and folder state
(`.opendocs/state.json`), so installing the CLI later keeps the sign-in and
the file-to-document mapping. It covers sign-in, publish, list, pull, history,
share, export, claim, team invites and the theme. It doesn't upload local
images, create projects from `--project`, export during publish, or run
`status`, `clone`, `rollback`, `move`, `save` or `sign`; install the CLI for
those.

```bash
bash ~/.claude/skills/opendocs/scripts/opendocs.sh login --email dana@halvard.example
bash ~/.claude/skills/opendocs/scripts/opendocs.sh publish q3-investor-update.md
```

The skill file's frontmatter `description` is what agents match your request
against, which is why it lists phrases like "turn this into a shareable link"
and "give me a PDF of these notes".

## Related pages

- [Set up your agent](../integrations/overview.md)
- [Agent quickstart](agent-quickstart.md)
- [Agent cookbook](../agents/cookbook.md)
- [CLI reference](../cli/reference.md)
