---
title: Aider
sidebar_position: 8
description: Set up OpenDocs in Aider with one prompt, then ask it to publish changelogs, design notes and session summaries from your repo.
---

# Aider

Aider is a pair-programming tool for the terminal that edits files in your git
repository. It doesn't run commands on its own: it suggests shell commands and
runs them when you say yes. That's all OpenDocs needs, so changelogs, design
notes and session summaries can become links your team can open.

## Set up with one prompt

1. Click **Copy prompt for agent** on [opendocs.cc](https://opendocs.cc), or
   copy it from the [Quickstart](../getting-started/quickstart.md). Already
   signed up? The **Connect your agent** card in your
   [dashboard](https://opendocs.cc/dashboard) has a version with your email
   filled in.
2. Start Aider in your repository and paste the prompt. When Aider offers to
   add the URLs in it to the chat, say yes: that's how it reads the agent
   quickstart.
3. Aider suggests the commands: the installer (`npx skills add` or
   `install.sh`), `npm install -g @opendocs.cc/cli` and
   `opendocs login --email`. Say yes to run each one, and yes when it asks to
   add the output to the chat, so it sees what happened.
4. Paste the 6-digit code from your email into the chat. Aider suggests the
   `--code` command; run it.

Aider has no skill support, so give it the OpenDocs instructions as a
read-only file once setup is done:

```bash
opendocs agent > OPENDOCS.md
```

```text
/read OPENDOCS.md
```

## Notes for Aider

- **Keep the instructions loaded.** Add the file to `.aider.conf.yml` so every
  session starts with it, or start Aider with `aider --read OPENDOCS.md`:

  ```yaml
  read: OPENDOCS.md
  ```

  `opendocs agent` prints the short guide. `opendocs agent --full` prints the
  whole skill, which covers more but takes much more context.
- **Run commands yourself when it's quicker.** `/run` (or `!`) runs a command
  and offers to add the output to the chat:

  ```text
  /run opendocs publish CHANGELOG-2.4.md --json
  ```

- **If Aider never offers to run commands**, check that shell command
  suggestions aren't turned off (`--no-suggest-shell-commands`).
- **Name the agent on versions.** OpenDocs doesn't detect Aider on its own, so
  versions say `opendocs-cli`. Start Aider with the variable set to fix that:

  ```bash
  OPENDOCS_CLIENT=aider aider --read OPENDOCS.md
  ```

- **No Node.js?** `install.sh` puts the instructions and a bash client in
  `~/.claude/skills/opendocs`. Load them with
  `/read ~/.claude/skills/opendocs/SKILL.md`; Aider then runs
  `bash ~/.claude/skills/opendocs/scripts/opendocs.sh` instead of `opendocs`.

## What to ask

> **Ask your agent**
>
> "Write a changelog for the commits since v2.3.0, grouped into features, fixes and breaking changes. Save it as CHANGELOG-2.4.md and publish it."
>
> "Summarize what we changed in this session as design notes, publish them to the Platform project and give me the link."
>
> "We decided to keep sessions in Redis. Write an ADR for it, publish it with the tag adr and send me a PDF."

Aider writes the file, suggests the publish command and, once you say yes,
gives you the link, for example `opendocs.cc/halvard/changelog-2-4`. Only
workspace members can open it. Publishing the same file again later updates
that link with a new version.

## Under the hood

```bash
# Setup
npx skills add opendocs-cc/skills --skill opendocs -g -y
npm install -g @opendocs.cc/cli
opendocs login --email dana@halvard.example --json
opendocs login --email dana@halvard.example --code 482913 --json
opendocs agent > OPENDOCS.md

# The prompts above
opendocs publish CHANGELOG-2.4.md --json
opendocs publish docs/design-notes-session-store.md --project platform --json
opendocs publish docs/adr/012-redis-sessions.md --tags adr --export pdf --json
```

See the [Agent cookbook](../agents/cookbook.md) for every recipe.

## Related pages

- [Set up your agent](overview.md)
- [The OpenDocs skill](../getting-started/skill-md.md)
- [What to ask your agent](../getting-started/what-to-ask.md)
- [Agent cookbook](../agents/cookbook.md)
