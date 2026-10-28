---
title: OpenClaw
sidebar_position: 2
description: Set up OpenDocs in OpenClaw with one prompt from any chat, then ask it to publish, export, share and file your documents.
---

# OpenClaw

OpenClaw is a personal agent you run on your own computer or server and talk to
from chat apps such as WhatsApp, Telegram, Slack and Discord, or from the
terminal. It runs commands on the machine its gateway runs on, so that's where
OpenDocs is installed and signed in. You ask from your phone; the link comes
back in the same chat.

## Set up with one prompt

1. Click **Copy prompt for agent** on [opendocs.cc](https://opendocs.cc), or
   copy it from the [Quickstart](../getting-started/quickstart.md). Already
   signed up? The **Connect your agent** card in your
   [dashboard](https://opendocs.cc/dashboard) has a version with your email
   filled in.
2. Send the prompt to OpenClaw in any chat you use with it.
3. If your command approval settings ask, approve the skill installer
   (`npx skills add` or `install.sh`), `npm install -g @opendocs.cc/cli` and
   `opendocs login --email`.
4. Paste the 6-digit code from your email into the same chat.

OpenClaw then reads the agent quickstart and asks what you'd like to publish.
OpenClaw itself runs on Node.js 22 or later, so the `npx` installer works on
its machine.

## Notes for OpenClaw

- **Where the skill lives.** Skills shared by all your agents live in
  `~/.openclaw/skills` on the gateway machine; one agent's own skills live in
  `skills/` inside its workspace. The installer uses `~/.openclaw/skills`, or
  `~/.clawdbot` or `~/.moltbot` if that's what your install still uses.
- **If OpenClaw doesn't see the skill**, start a new session (`/new`). Setup
  itself doesn't need it: the prompt has OpenClaw read the agent quickstart
  instead.
- **Files land on the gateway machine.** PDFs from `--export` are written next
  to the Markdown on that machine. Ask OpenClaw to send you the file if your
  chat app takes attachments, or, on Pro and Team, to save it to one of your
  workspace's [Google Drive](google-drive.md) folders.
- **Name the agent on versions.** OpenDocs doesn't detect OpenClaw on its own,
  so versions say `opendocs-cli`. Set `OPENDOCS_CLIENT=openclaw` in the
  environment the gateway runs in.
- **Install it yourself** (on the gateway machine):

  ```bash
  npx skills add opendocs-cc/skills --skill opendocs -g -y -a openclaw
  opendocs agent --install --agent openclaw     # already have the CLI
  ```

## What to ask

> **Ask your agent**
>
> "Turn my notes from today's Halvard board call into minutes, publish them to the Board project and send me the link."
>
> "Save the approved minutes as a PDF to the Board Minutes folder in Drive."
>
> "Every Friday afternoon, turn this week's notes into a status update, publish it and post the link here."

OpenClaw writes the Markdown on its machine, publishes it and replies with the
link on its own line, for example
`opendocs.cc/halvard/projects/board/board-call-2026-10-22`. Only workspace
members can open it. For Drive it uses the folder names your workspace set up
and asks if your words match more than one.

## Under the hood

```bash
# Setup
npx skills add opendocs-cc/skills --skill opendocs -g -y
npm install -g @opendocs.cc/cli
opendocs login --email dana@halvard.example --json
opendocs login --email dana@halvard.example --code 482913 --json

# The prompts above
opendocs publish minutes/board-call-2026-10-22.md --project board --json
opendocs integrations --json                                   # Drive folder names
opendocs save minutes/board-call-2026-10-22.md --folder "Board Minutes" --json
opendocs publish status/2026-10-23.md --project board --json   # each Friday
```

`opendocs save` returns the Drive link in `file.url`. Drive saving and
signature requests need the Pro or Team plan and a connected integration. See
the [Agent cookbook](../agents/cookbook.md) for every recipe.

## Related pages

- [Set up your agent](overview.md)
- [The OpenDocs skill](../getting-started/skill-md.md)
- [Google Drive](google-drive.md)
- [Agent cookbook](../agents/cookbook.md)
