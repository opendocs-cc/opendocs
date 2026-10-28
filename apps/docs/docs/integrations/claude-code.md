---
title: Claude Code
sidebar_position: 4
description: Set up OpenDocs in Claude Code with one prompt, then ask it to publish, export and share the Markdown it writes.
---

# Claude Code

Claude Code is Anthropic's coding agent. It already writes specs, plans,
decision records and changelogs as Markdown; with OpenDocs it turns them into
links your team can open and PDFs you can send, without leaving the session.

## Set up with one prompt

1. Click **Copy prompt for agent** on [opendocs.cc](https://opendocs.cc), or
   copy it from the [Quickstart](../getting-started/quickstart.md). Already
   signed up? The **Connect your agent** card in your
   [dashboard](https://opendocs.cc/dashboard) has a version with your email
   filled in.
2. Start Claude Code in your project folder (`claude`) and paste the prompt.
3. Approve the commands it asks to run: the skill installer (`npx skills add`
   or `install.sh`), possibly `npm install -g @opendocs.cc/cli`, and
   `opendocs login --email`.
4. Paste the 6-digit code from your email into the chat.

Claude Code then reads the agent quickstart and asks what you'd like to
publish. The skill is installed in `~/.claude/skills/opendocs`, so it's there
in every project. The API key it saves is named `claude-code`, and version
history shows which documents Claude Code published.

## Notes for Claude Code

- **Where the skill lives.** Personal skills are in
  `~/.claude/skills/<name>/SKILL.md` and work in every project. Project skills
  in `.claude/skills/` travel with the repository. Claude Code uses the
  OpenDocs skill on its own when you ask to publish, share or export, and you
  can call it directly with `/opendocs`.
- **If Claude Code doesn't see the skill**, start a new session. Setup itself
  doesn't need it: the prompt has Claude Code read the agent quickstart
  instead.
- **Fewer permission prompts.** Claude Code asks before each shell command. To
  let OpenDocs commands run without asking, pick the "don't ask again" option
  when it asks, or add a rule to `.claude/settings.json`. The skill still asks
  you in chat before anything public, a signature request or a theme change.

  ```json
  {
    "permissions": {
      "allow": ["Bash(opendocs:*)"]
    }
  }
  ```

- **Install the OpenDocs.cc plugin** from the OpenDocs marketplace. It adds the
  skill, the MCP server and `/opendocs-cc:publish` and `/opendocs-cc:export`,
  and updates itself:

  ```text
  /plugin marketplace add opendocs-cc/skills
  /plugin install opendocs-cc@opendocs-cc
  ```

- **Or install the skill yourself:**

  ```bash
  npx skills add opendocs-cc/skills --skill opendocs -g -y -a claude-code
  curl -fsSL https://opendocs.cc/install.sh | bash      # no Node.js
  opendocs agent --install                              # already have the CLI
  opendocs agent --install .claude/skills/opendocs      # this repo only; commit it to share
  ```

## What to ask

> **Ask your agent**
>
> "Write up the event-sourcing decision we just made as an ADR, publish it to the Platform project and give me the link."
>
> "Publish everything in docs/runbooks with the tag runbooks, then send me PDFs of the database failover and payment outage runbooks."
>
> "Share the Q3 investor update with the Brightwater team, everyone at @brightwater.example."

Claude Code writes the file, publishes it and replies with the link on its own
line, for example `opendocs.cc/halvard/projects/platform/adr-007-event-sourcing`,
and says who can open it (workspace members, by default). PDFs land next to the
Markdown files. Ask for a change later and it publishes the same file again:
same link, new version.

## Under the hood

```bash
# Setup
npx skills add opendocs-cc/skills --skill opendocs -g -y
opendocs login --email dana@halvard.example --json
opendocs login --email dana@halvard.example --code 482913 --json

# The prompts above
opendocs project list --json
opendocs publish docs/adr/007-event-sourcing.md --project platform --json
opendocs publish docs/runbooks --tags runbooks --json
opendocs export database-failover payment-outage --format pdf -o ./exports --json
opendocs share q3-investor-update.md @brightwater.example --json
```

`<doc>` arguments take a post ID, a slug, or a local `.md` file this folder
published. Re-running `opendocs publish` on a file this folder already
published updates it; there's no need for `opendocs update` or for keeping
track of post IDs. See the [Agent cookbook](../agents/cookbook.md) for every
recipe.

## Related pages

- [Set up your agent](overview.md)
- [The OpenDocs skill](../getting-started/skill-md.md)
- [What to ask your agent](../getting-started/what-to-ask.md)
- [Agent cookbook](../agents/cookbook.md)
