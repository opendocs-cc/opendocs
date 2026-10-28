---
title: Hermes Agent
sidebar_position: 9
description: Set up OpenDocs in Hermes Agent with one prompt, then ask it to publish and update recurring reports and send you the links wherever you talk to it.
---

# Hermes Agent

Hermes Agent, from Nous Research, runs on your computer or a server and talks
to you from the terminal or messaging apps such as Telegram, Discord, Slack and
email. It remembers context across sessions, which suits documents you update
every week: the brief keeps its link and gains a version each time.

## Set up with one prompt

1. Click **Copy prompt for agent** on [opendocs.cc](https://opendocs.cc), or
   copy it from the [Quickstart](../getting-started/quickstart.md). Already
   signed up? The **Connect your agent** card in your
   [dashboard](https://opendocs.cc/dashboard) has a version with your email
   filled in.
2. Send the prompt to Hermes in the terminal or any chat you use with it.
3. If Hermes asks you to approve commands, approve the skill installer
   (`npx skills add` or `install.sh`), `npm install -g @opendocs.cc/cli` and
   `opendocs login --email`.
4. Paste the 6-digit code from your email into the same chat.

Hermes then reads the agent quickstart and asks what you'd like to publish.

## Notes for Hermes Agent

- **Where the skill lives.** Hermes loads skills from `~/.hermes/skills` (or
  `$HERMES_HOME/skills`). If it doesn't see the new skill, start a new
  session. Setup itself doesn't need it: the prompt has Hermes read the agent
  quickstart instead.
- **Install where commands run.** If Hermes runs commands in Docker, over SSH
  or in another remote backend, the CLI, the skill and the sign-in
  (`~/.config/opendocs/config.json`) all belong in that environment, not on
  the machine you chat from.
- **Unattended servers.** Sign in once with an API key from the dashboard. The
  CLI reads `OPENDOCS_API_KEY` during `login` and saves it, so later commands
  work without the variable:

  ```bash
  OPENDOCS_API_KEY=od_live_xxxxx opendocs login --json
  ```

- **Name the agent on versions.** OpenDocs doesn't detect Hermes on its own, so
  versions say `opendocs-cli`. Set `OPENDOCS_CLIENT=hermes` in the environment
  Hermes runs commands in.
- **Install it yourself:**

  ```bash
  npx skills add opendocs-cc/skills --skill opendocs -g -y -a hermes-agent
  opendocs agent --install --agent hermes-agent     # already have the CLI

  # No Node.js: the skill plus a curl + jq client
  curl -fsSL https://opendocs.cc/install.sh | OPENDOCS_SKILL_DIR="$HOME/.hermes/skills/opendocs" bash
  ```

## What to ask

> **Ask your agent**
>
> "Write this week's engineering brief from my notes, publish it to the Engineering project and send me the link here."
>
> "Add the rollout notes to last week's brief instead of making a new one."
>
> "Every Friday at 4pm, publish the status report and send the link to the team channel."

Hermes publishes the brief and sends the link back to the chat you asked from,
on its own line, for example
`opendocs.cc/halvard/projects/engineering/engineering-brief`. Only workspace
members can open it. When it updates the brief, the link stays the same and
version history shows each week's edition and that Hermes published it.

## Under the hood

```bash
# Setup
npx skills add opendocs-cc/skills --skill opendocs -g -y
npm install -g @opendocs.cc/cli
opendocs login --email dana@halvard.example --json
opendocs login --email dana@halvard.example --code 482913 --json

# The prompts above
opendocs publish briefs/engineering-brief.md --project engineering --json
opendocs publish briefs/engineering-brief.md --json        # same file again: new version
opendocs history briefs/engineering-brief.md --json
```

Without Node.js, the same commands run through
`bash ~/.hermes/skills/opendocs/scripts/opendocs.sh` (sign in once with its
`login --email` or `login --key`). It doesn't upload local images, support
`--export` on publish or save to Drive; run `export` separately. See the
[Agent cookbook](../agents/cookbook.md) for every recipe.

## Related pages

- [Set up your agent](overview.md)
- [The OpenDocs skill](../getting-started/skill-md.md)
- [What to ask your agent](../getting-started/what-to-ask.md)
- [Agent cookbook](../agents/cookbook.md)
