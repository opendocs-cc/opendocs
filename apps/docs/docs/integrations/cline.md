---
title: Cline
sidebar_position: 7
description: Set up OpenDocs in Cline with one prompt, then ask it to write, publish, export and share docs as part of its tasks.
---

# Cline

Cline is an autonomous coding agent that runs in your editor. It reads and
writes files, runs terminal commands and chains steps, so "read the code, write
the doc, publish it, give me the link" is one task. OpenDocs gives those docs a
link your team can open and, when you ask, a PDF.

## Set up with one prompt

1. Click **Copy prompt for agent** on [opendocs.cc](https://opendocs.cc), or
   copy it from the [Quickstart](../getting-started/quickstart.md). Already
   signed up? The **Connect your agent** card in your
   [dashboard](https://opendocs.cc/dashboard) has a version with your email
   filled in.
2. Open Cline, switch to **Act** mode (Plan mode doesn't run commands) and
   paste the prompt.
3. Approve the commands it asks to run: the skill installer (`npx skills add`
   or `install.sh`), possibly `npm install -g @opendocs.cc/cli`, and
   `opendocs login --email`.
4. Paste the 6-digit code from your email into the chat.

Cline then reads the agent quickstart and asks what you'd like to publish.

## Notes for Cline

- **Where the skill lives.** The `npx skills` installer puts the skill where
  Cline looks for global skills. Cline's skill support may need to be switched
  on in its settings. If Cline doesn't use the skill, add a rule instead.
- **Rules.** Cline loads every file in a project's `.clinerules/` folder (and
  your global rules folder) into each task. The short OpenDocs guide makes a
  good rule:

  ```bash
  mkdir -p .clinerules
  opendocs agent > .clinerules/opendocs.md
  echo "- Pass --client cline to every opendocs command." >> .clinerules/opendocs.md
  ```

- **Name the agent on versions.** OpenDocs doesn't detect Cline on its own, so
  versions and the saved API key say `opendocs-cli` unless Cline passes
  `--client cline`, as in the rule above.
- **Auto-approve.** If you let Cline run commands without asking, the skill
  still asks you in chat before anything public, a signature request or a
  theme change.
- **Install it yourself:**

  ```bash
  npx skills add opendocs-cc/skills --skill opendocs -g -y -a cline
  curl -fsSL https://opendocs.cc/install.sh | bash       # no Node.js
  ```

  Without Node.js, the skill and its bash client go to
  `~/.claude/skills/opendocs` (and `~/.agents/skills/opendocs` when that folder
  exists); point a rule at it if Cline doesn't pick it up.

## What to ask

> **Ask your agent**
>
> "Look at src/services/billing.ts and write a doc explaining the new proration logic. Publish it to the Billing project with the tag billing."
>
> "For each service in src/services, write a one-page overview, publish them all with the tag architecture and give me the links."
>
> "Publish the v2 changelog publicly so customers can read it."

Cline writes the files, publishes them in one batch and replies with each link
on its own line, for example `opendocs.cc/halvard/projects/billing/proration`.
Only workspace members can open them. For the public changelog it checks with
you first, because anyone with the link will be able to read it, then
publishes it as public.

## Under the hood

```bash
# Setup
npx skills add opendocs-cc/skills --skill opendocs -g -y
opendocs login --email dana@halvard.example --client cline --json
opendocs login --email dana@halvard.example --code 482913 --client cline --json

# The prompts above
opendocs publish docs/billing-proration.md --project billing --tags billing --client cline --json
opendocs publish docs/services --tags architecture --client cline --json
opendocs publish CHANGELOG-v2.md --visibility public --confirm-public --client cline --json
```

Public publishing also needs the workspace's **Allow public documents**
setting. Later edits to any of these files go to the same links when Cline
publishes them again from this folder. See the
[Agent cookbook](../agents/cookbook.md) for every recipe.

## Related pages

- [Set up your agent](overview.md)
- [The OpenDocs skill](../getting-started/skill-md.md)
- [What to ask your agent](../getting-started/what-to-ask.md)
- [Agent cookbook](../agents/cookbook.md)
