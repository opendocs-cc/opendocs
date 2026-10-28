---
title: Quickstart
description: Paste one prompt into your agent, enter the code from your email, and publish your first document. About two minutes.
---

# Quickstart

You need an agent that can run terminal commands (Claude Code, Codex, Cursor,
GitHub Copilot, Cline, Aider and others) and an email address. No browser
sign-up, no API keys to copy. It takes about two minutes and it's free for up to
50 documents.

## 1. Copy the prompt

Click **Copy prompt for agent** on [opendocs.cc](https://opendocs.cc), or copy it
from here:

<div className="od-prompt">

```text title="Paste this into your agent"
I'd like you to set up OpenDocs: Markdown publishing for agents (shareable links, plus PDF and DOCX export).

Install as a skill if I have npm: npx skills add opendocs-cc/skills --skill opendocs -g -y

If not, do this instead: curl -fsSL https://opendocs.cc/install.sh | bash

The npx installer may end with "PromptScript does not support global skill installation". That's a known installer bug that only affects PromptScript; the skill is still installed.

Then sign me up (it's free): ask for my email, run opendocs login --email <my email>, and I'll paste the 6-digit code it sends me.

After that, read the agent quickstart at https://docs.opendocs.cc/getting-started/agent-quickstart.md and ask me what I'd like to publish
```

</div>

Already have an account? The **Connect your agent** card in your
[dashboard](https://opendocs.cc/dashboard) has a version with your email and
workspace filled in, so your agent signs you in instead of asking.

## 2. Paste it into your agent

Your agent asks to run a few commands. Approve them:

- **Install the OpenDocs skill.** With Node.js it uses `npx skills add`; without
  it, the `install.sh` script. The skill is a set of instructions that teaches your
  agent the OpenDocs commands and the rules that go with them, such as asking
  before making anything public. With Node.js, your agent may also install the
  OpenDocs CLI (`npm install -g @opendocs.cc/cli`).
- **Sign you in.** It runs `opendocs login --email <your email>`, which sends you a
  6-digit code.

If the `npx` install ends with an error about PromptScript, that's a known bug in
the installer that only affects PromptScript. The skill is installed for your
other agents.

## 3. Enter the code

Check your inbox for an email from OpenDocs and paste the code into the chat. Codes
expire after 10 minutes; if yours did, ask your agent to send a new one.

If the email is new to OpenDocs, this creates your account, a workspace at
`opendocs.cc/<username>` and a Default project. Your agent saves an API key named
after itself (for example `claude-code`), so it stays signed in.

## 4. Ask for your first document

Your agent reads the [agent quickstart](agent-quickstart.md) and asks what you'd
like to publish. Ask for anything you'd normally write up:

> **Ask your agent**
>
> "Write a one-page summary of this project's README and publish it."
>
> "Turn my notes from today's call into a client update and send me the PDF."

You get a link like `opendocs.cc/<workspace>/project-summary`. Only members of
your workspace can open it until you decide otherwise, and the link stays the same
every time the document is updated. Ask for a PDF and it lands next to the
Markdown file.

## Other ways to start

- **Sign up in the browser.** Create an account at
  [opendocs.cc/signup](https://opendocs.cc/signup), then copy the prompt from the
  **Connect your agent** card in the dashboard.
- **Try it without an account.** Ask your agent to publish anonymously. You get a
  link anyone can open for 24 hours, plus a claim link to keep it. See
  [Share with people](../visibility/sharing-and-anonymous-links.md).
- **Type the commands yourself.** Everything your agent does is an `opendocs`
  command. See [Use the CLI yourself](cli-quickstart.md).

## Next

- [What to ask your agent](what-to-ask.md): publishing, exports, branding,
  sharing, versions, Drive and e-signatures.
- [How OpenDocs works](how-opendocs-works.md): workspaces, projects, documents and
  versions.
- [Set up your agent](../integrations/overview.md): notes for Claude Code, Codex,
  Cursor and others.
