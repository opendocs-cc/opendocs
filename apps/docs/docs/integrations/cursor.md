---
title: Cursor
sidebar_position: 5
description: Set up OpenDocs in Cursor with one prompt, then ask its agent to write docs from your code and publish, export and share them.
---

# Cursor

Cursor's agent reads your codebase, writes files and runs terminal commands, so
it can write an API reference or a migration plan from your code and publish
it in the same chat. You get a link your team can open and, when you ask, a
PDF.

## Set up with one prompt

1. Click **Copy prompt for agent** on [opendocs.cc](https://opendocs.cc), or
   copy it from the [Quickstart](../getting-started/quickstart.md). Already
   signed up? The **Connect your agent** card in your
   [dashboard](https://opendocs.cc/dashboard) has a version with your email
   filled in.
2. Open your project in Cursor, open the Agent chat and paste the prompt.
3. Approve the commands it asks to run: the skill installer (`npx skills add`
   or `install.sh`), possibly `npm install -g @opendocs.cc/cli`, and
   `opendocs login --email`. Cursor shows each command and waits for you to
   run it.
4. Paste the 6-digit code from your email into the chat.

Cursor then reads the agent quickstart and asks what you'd like to publish. The
skill is installed in `~/.cursor/skills/opendocs`. The API key it saves is
named `cursor`, and version history shows which documents Cursor published.

## Notes for Cursor

- **Where the skill lives.** Cursor loads skills from `~/.cursor/skills` for
  every project. Its agent uses the OpenDocs skill when you ask to publish,
  share or export.
- **If Cursor doesn't see the skill**, start a new chat. Setup itself doesn't
  need it: the prompt has Cursor read the agent quickstart instead.
- **Rules.** To make publishing part of how Cursor works in one project, add a
  rule in `.cursor/rules/` (the older `.cursorrules` file still works) or a
  line in `AGENTS.md`, for example "When you finish a doc, publish it with the
  OpenDocs skill and reply with the link."
- **Fewer prompts.** Cursor asks before running terminal commands unless they
  are on the allowlist in its agent settings. Adding `opendocs` there lets
  OpenDocs commands run without asking; the skill still asks you in chat before
  anything public, a signature request or a theme change.
- **Install it yourself:**

  ```bash
  npx skills add opendocs-cc/skills --skill opendocs -g -y -a cursor
  opendocs agent --install --agent cursor     # already have the CLI

  # No Node.js
  curl -fsSL https://opendocs.cc/install.sh | OPENDOCS_SKILL_DIR="$HOME/.cursor/skills/opendocs" bash
  ```

## What to ask

> **Ask your agent**
>
> "Read src/routes and write an API reference for the partner endpoints. Publish it to the Partner API project and give me the link."
>
> "Summarize what changed on this branch as release notes, publish them and give me a PDF for the changelog email."
>
> "Share the partner API reference with the Brightwater team, everyone at @brightwater.example."

Cursor writes the Markdown file, publishes it and replies with the link on its
own line, for example
`opendocs.cc/halvard/projects/partner-api/partner-api-reference`. Only
workspace members can open it until you share it. Sharing with
`@brightwater.example` lets anyone with a verified address at that domain read
that one document; they don't join your workspace.

## Under the hood

```bash
# Setup
npx skills add opendocs-cc/skills --skill opendocs -g -y
opendocs login --email dana@halvard.example --json
opendocs login --email dana@halvard.example --code 482913 --json

# The prompts above
opendocs publish docs/partner-api-reference.md --project partner-api --json
opendocs publish docs/release-notes-2.4.md --export pdf --json
opendocs share docs/partner-api-reference.md @brightwater.example --json
```

With `--json`, a single publish returns one object (abridged):

```json
{
  "postId": "8c1e4f52-6a0b-4d8e-9f3a-2b7d5c1e0a94",
  "slug": "partner-api-reference",
  "url": "/halvard/projects/partner-api/partner-api-reference",
  "title": "Partner API reference",
  "versionNumber": 1,
  "projectSlug": "partner-api",
  "projectSource": "flag"
}
```

`url` is a path: prepend `https://opendocs.cc` before showing it. With
`--export pdf` the object also has `export.path`, the local PDF next to the
source file. See the [Agent cookbook](../agents/cookbook.md) for every recipe.

## Related pages

- [Set up your agent](overview.md)
- [The OpenDocs skill](../getting-started/skill-md.md)
- [What to ask your agent](../getting-started/what-to-ask.md)
- [Agent cookbook](../agents/cookbook.md)
