---
title: GitHub Copilot
sidebar_position: 6
description: Set up OpenDocs in GitHub Copilot's agent mode with one prompt, then ask it to publish, export and share release notes, runbooks and specs.
---

# GitHub Copilot

GitHub Copilot's agent mode in VS Code, and the Copilot CLI, can run terminal
commands in your workspace. With OpenDocs, the release notes, runbooks and
specs it writes become links your team can open and PDFs you can send.

## Set up with one prompt

1. Click **Copy prompt for agent** on [opendocs.cc](https://opendocs.cc), or
   copy it from the [Quickstart](../getting-started/quickstart.md). Already
   signed up? The **Connect your agent** card in your
   [dashboard](https://opendocs.cc/dashboard) has a version with your email
   filled in.
2. Open Copilot Chat in VS Code, switch to **Agent** mode and paste the prompt.
   In the Copilot CLI, paste it at the prompt.
3. Approve the commands it asks to run: the skill installer (`npx skills add`
   or `install.sh`), possibly `npm install -g @opendocs.cc/cli`, and
   `opendocs login --email`. Copilot shows each command and waits for you to
   allow it.
4. Paste the 6-digit code from your email into the chat.

Copilot then reads the agent quickstart and asks what you'd like to publish.
The skill is installed in `~/.copilot/skills/opendocs`.

## Notes for GitHub Copilot

- **Where the skill lives.** Copilot loads personal skills from
  `~/.copilot/skills` and repository skills from `.github/skills`. If your
  version of Copilot doesn't load skills, use custom instructions instead.
- **Custom instructions.** `.github/copilot-instructions.md` is added to every
  Copilot Chat request in the repository. Put the short OpenDocs guide there,
  or one line such as "When you finish a doc, publish it with the OpenDocs CLI
  and reply with the link":

  ```bash
  opendocs agent >> .github/copilot-instructions.md
  ```

- **Name the agent on versions.** OpenDocs doesn't detect Copilot on its own,
  so versions and the saved API key say `opendocs-cli`. Add "Pass
  `--client github-copilot` to every opendocs command" to your instructions to
  fix that.
- **Be explicit about publishing.** Copilot treats the task as done when the
  file is written unless you ask for the link. "Publish it and give me the
  link" works better than assuming it will.
- **Fewer prompts.** VS Code's `chat.tools.terminal.autoApprove` setting can
  allow `opendocs` commands without asking. The skill still asks you in chat
  before anything public, a signature request or a theme change.

  ```json
  {
    "chat.tools.terminal.autoApprove": { "opendocs": true }
  }
  ```

- **Install it yourself:**

  ```bash
  npx skills add opendocs-cc/skills --skill opendocs -g -y -a github-copilot
  opendocs agent --install ~/.copilot/skills/opendocs     # already have the CLI

  # No Node.js
  curl -fsSL https://opendocs.cc/install.sh | OPENDOCS_SKILL_DIR="$HOME/.copilot/skills/opendocs" bash
  ```

## What to ask

> **Ask your agent**
>
> "Turn the commits since v2.4.0 into release notes, publish them with the tag release and give me the link."
>
> "Write a troubleshooting guide for our CI from .github/workflows and publish it to the Engineering project so the team can see it."
>
> "Add the new environment variables section to the onboarding guide and publish it again."

Copilot writes the Markdown, publishes it and replies with the link on its own
line, for example `opendocs.cc/halvard/release-v2-5`. Only workspace members can
open it unless you ask otherwise. Publishing the onboarding guide again keeps
its link and adds a version, so people who bookmarked it see the new section.

## Under the hood

```bash
# Setup
npx skills add opendocs-cc/skills --skill opendocs -g -y
opendocs login --email dana@halvard.example --json
opendocs login --email dana@halvard.example --code 482913 --json

# The prompts above
opendocs publish release-v2.5.md --tags release --client github-copilot --json
opendocs publish docs/ci-troubleshooting.md --project engineering --client github-copilot --json
opendocs publish docs/onboarding.md --client github-copilot --json   # same file again: new version
```

If the onboarding guide was published from another machine or folder, the
agent pulls it first and updates it by slug:
`opendocs update docs/onboarding.md --post-id onboarding --json`. See the
[Agent cookbook](../agents/cookbook.md) for every recipe.

## Related pages

- [Set up your agent](overview.md)
- [The OpenDocs skill](../getting-started/skill-md.md)
- [What to ask your agent](../getting-started/what-to-ask.md)
- [Agent cookbook](../agents/cookbook.md)
