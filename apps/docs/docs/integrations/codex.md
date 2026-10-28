---
title: Codex
sidebar_position: 3
description: Set up OpenDocs in Codex with one prompt, then ask it to publish, export and share the docs it writes across your project.
---

# Codex

Codex is OpenAI's coding agent, in the terminal, your IDE and the cloud. It's
good at multi-step work like "write three docs, publish them and give me the
links", and with OpenDocs those docs become links your team can open and PDFs
you can send.

## Set up with one prompt

1. Click **Copy prompt for agent** on [opendocs.cc](https://opendocs.cc), or
   copy it from the [Quickstart](../getting-started/quickstart.md). Already
   signed up? The **Connect your agent** card in your
   [dashboard](https://opendocs.cc/dashboard) has a version with your email
   filled in.
2. Start Codex in your project folder (`codex`), or open Codex in your IDE, and
   paste the prompt.
3. Approve the commands it asks to run: the skill installer (`npx skills add`
   or `install.sh`), possibly `npm install -g @opendocs.cc/cli`, and
   `opendocs login --email`. These need network access, so Codex usually asks
   to run them outside its sandbox.
4. Paste the 6-digit code from your email into the chat.

Codex then reads the agent quickstart and asks what you'd like to publish. The
skill is installed in `~/.agents/skills/opendocs`. When the CLI recognizes
Codex from its environment, the API key it saves is named `codex` and version
history shows which documents Codex published.

## Notes for Codex

- **Where the skill lives.** Codex reads skills from `~/.agents/skills` (yours,
  in every project) and from `.agents/skills` inside a repository. It uses the
  OpenDocs skill when you ask to publish, share or export; you can also mention
  it directly with `$opendocs`.
- **If Codex doesn't see the skill**, start a new session. Setup itself doesn't
  need it: the prompt has Codex read the agent quickstart instead.
- **Network and the sandbox.** OpenDocs commands talk to
  `api.opendocs.cc`. In the default sandbox Codex asks before each one. To let
  them run inside the sandbox, turn on network access in
  `~/.codex/config.toml`:

  ```toml
  [sandbox_workspace_write]
  network_access = true
  ```

  In Codex cloud tasks, internet access is off by default. Turn it on for the
  environment and allow at least `api.opendocs.cc` (plus `opendocs.cc` and
  `registry.npmjs.org` for setup).
- **Make it a project habit.** Add a line to the repository's `AGENTS.md`, for
  example "When you finish a doc, publish it with the OpenDocs skill and reply
  with the link."
- **Install it yourself:**

  ```bash
  npx skills add opendocs-cc/skills --skill opendocs -g -y -a codex
  curl -fsSL https://opendocs.cc/install.sh | bash        # no Node.js
  opendocs agent --install --agent codex      # already have the CLI
  ```

  `install.sh` writes to `~/.agents/skills/opendocs` when `~/.codex` or
  `~/.agents` exists, and to `~/.claude/skills/opendocs`.

## What to ask

> **Ask your agent**
>
> "Document the schema changes on this branch as a migration guide, publish it to the Platform project and give me the link."
>
> "Write docs for the three new order endpoints in docs/api, publish them with the tag api-v2 and give me a table of the links."
>
> "Save the v3 migration guide to docs/migration-v3.md but don't publish it until I've read it."

Codex writes the files, publishes them in one batch and replies with each link
on its own line, for example `opendocs.cc/halvard/projects/platform/migration-v3`.
Only workspace members can open them unless you ask otherwise. When you've read
the draft and say "publish it", it publishes that file; later edits go to the
same link as new versions.

## Under the hood

```bash
# Setup
npx skills add opendocs-cc/skills --skill opendocs -g -y
opendocs login --email dana@halvard.example --json
opendocs login --email dana@halvard.example --code 482913 --json

# The prompts above
opendocs publish docs/migration-v3.md --project platform --json
opendocs publish docs/api/create-order.md docs/api/get-order.md docs/api/cancel-order.md --tags api-v2 --json
opendocs list --tag api-v2 --json
```

A multi-file publish returns one object with `total`, `succeeded`, `failed`
and a `results` array; a batch with some failures still exits 0, so check
`failed`. If versions show `opendocs-cli` instead of `codex` (Codex wasn't
detected from its environment), set `OPENDOCS_CLIENT=codex` or pass
`--client codex`. See the [Agent cookbook](../agents/cookbook.md) for every
recipe.

## Related pages

- [Set up your agent](overview.md)
- [The OpenDocs skill](../getting-started/skill-md.md)
- [What to ask your agent](../getting-started/what-to-ask.md)
- [Agent cookbook](../agents/cookbook.md)
