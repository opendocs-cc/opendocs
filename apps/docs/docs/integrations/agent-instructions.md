---
title: Tell your agent when to publish
sidebar_position: 1.5
description: Copy-paste instructions for AGENTS.md, CLAUDE.md, Cursor rules and Copilot so your agent publishes plans, specs and reports to OpenDocs without being asked each time.
---

# Tell your agent when to publish

The OpenDocs skill teaches your agent *how* to publish. A few lines in your
project's instruction file tell it *when*: which documents belong on OpenDocs,
which project they go to, and who should be able to read them. Paste one of the
blocks below and change the project name.

## The instructions

This block works in every agent. Replace `Platform` with your project's name
(`opendocs project list` shows them; a new name creates the project the first
time).

```markdown
## Publishing documents (OpenDocs)

This repository publishes written documents with OpenDocs (the `opendocs` CLI and skill).

- When you write something meant for people rather than for the code (a plan, spec, ADR, runbook, incident review, report or proposal), save it as Markdown under `docs/` and publish it with `opendocs publish <file> --project "Platform" --json`. Give me the link on its own line.
- Publishing the same file again updates the same link and keeps the history. Don't make copies with `--new`.
- Keep the default visibility (workspace members). Never make a document public unless I ask for a public link.
- Link related documents to each other with the full `https://opendocs.cc/...` URLs from `opendocs publish --json` or `opendocs list --json`.
- When I ask for a PDF or Word file, add `--export pdf` (or `docx`) and tell me where the file was saved.
- If `opendocs` isn't installed, install the skill with `npx skills add opendocs-cc/skills --skill opendocs -g -y` and the CLI with `npm install -g @opendocs.cc/cli`, then sign in with `opendocs login --email <my email>`.
```

To send everything from this folder to the project without `--project` each
time, run this once in the repository (it's stored in `.opendocs/`):

```bash
opendocs project link "Platform"
```

## Where to paste it

| Agent | File | Notes |
| --- | --- | --- |
| Codex, Cursor, GitHub Copilot, OpenClaw, Gemini CLI and most others | `AGENTS.md` in the repository root | The shared standard. Add the block as a section. |
| Claude Code | `CLAUDE.md` in the repository root | Or keep the block in `AGENTS.md` and add the line `@AGENTS.md` to `CLAUDE.md`. |
| Cursor (project rule) | `.cursor/rules/opendocs.mdc` | See the rule below. |
| GitHub Copilot | `.github/copilot-instructions.md` | Copilot also reads `AGENTS.md`. |

For all your projects at once, put the block in your personal instruction file
instead: `~/.claude/CLAUDE.md` for Claude Code, `~/.codex/AGENTS.md` for Codex.
Leave out the project name there and let the skill pick the project.

### Cursor rule

Save this as `.cursor/rules/opendocs.mdc`:

```markdown
---
description: Publishing plans, specs, ADRs, runbooks and reports to OpenDocs
alwaysApply: false
---

When you write a document meant for people rather than code (a plan, spec, ADR, runbook, incident review, report or proposal), save it as Markdown under `docs/` and publish it with `opendocs publish <file> --project "Platform" --json`. Give the link on its own line.

Publishing the same file again updates the same link. Keep the default workspace visibility; never make a document public unless asked. When asked for a PDF or Word file, add `--export pdf` or `--export docx`.
```

With `alwaysApply: false`, Cursor brings the rule in when the conversation is
about documents. Set it to `true` if you want it in every chat.

## Shorter version

For a personal instruction file, or when you only want the habit:

```markdown
When you write a plan, spec, ADR, runbook or report for people to read, publish it with OpenDocs (`opendocs publish <file> --json`) and give me the link. Same file again = same link. Never make it public unless I ask.
```

## Related pages

- [Set up your agent](overview.md): the one-prompt setup
- [The OpenDocs skill](../getting-started/skill-md.md): what the skill teaches and how to install it
- [Projects](../publishing/projects.md): how documents are grouped, and `project link`
- [Claude Code](claude-code.md), [Codex](codex.md), [Cursor](cursor.md), [GitHub Copilot](copilot.md)
