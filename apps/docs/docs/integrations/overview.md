---
title: Set up your agent
sidebar_position: 1
description: Connect Claude Code, Codex, Cursor or any agent that can run a command to OpenDocs with one prompt, and choose between the skill, the CLI, the bash client, the MCP server and the API.
---

# Set up your agent

OpenDocs works with any agent that can run a terminal command or make an HTTP
request. You set it up once by pasting one prompt into your agent. After that
you ask in plain language ("Publish the Q3 investor update to the Investors
project and send me the PDF") and your agent runs the commands.

These agents have their own page with setup notes:
[Claude Code](claude-code.md), [Codex](codex.md), [Cursor](cursor.md),
[GitHub Copilot](copilot.md), [Cline](cline.md), [Aider](aider.md),
[OpenClaw](openclaw.md) and [Hermes Agent](hermes-agent.md). Gemini CLI and
other agents that support skills work the same way.

To have your agent publish plans, specs and reports without being asked each
time, add a few lines to `AGENTS.md` or `CLAUDE.md`: see
[Tell your agent when to publish](agent-instructions.md).

:::tip Using the Claude or ChatGPT app?
Chat apps can't run commands, so they connect through the
[OpenDocs MCP server](mcp.md) instead: add one URL, sign in with your
OpenDocs account and ask. Coding tools can use MCP too, but the skill and CLI
below are better for local files, folders and images.
:::

:::note Looking for Google Drive or e-signatures?
Those are product integrations you connect in the dashboard's **Integrations**
tab, not agent setup. See [Google Drive](google-drive.md) and
[E-signatures with DocuSeal](docuseal.md).
:::

## Start with one prompt

Click **Copy prompt for agent** on [opendocs.cc](https://opendocs.cc) and paste
it into your agent. The full text is also on the
[Quickstart](../getting-started/quickstart.md). If you already have an account,
use the **Connect your agent** card in your
[dashboard](https://opendocs.cc/dashboard) instead: its prompt has your email
and workspace filled in, so your agent signs you in rather than asking.

The prompt asks your agent to install the OpenDocs skill, sign you up with an
emailed code, read the
[agent quickstart](../getting-started/agent-quickstart.md) and ask what you'd
like to publish. What happens next:

1. **Your agent installs the OpenDocs skill.** It asks to run the installer.
   Approve it. With Node.js it may also install the OpenDocs CLI.
2. **It asks for your email** and runs `opendocs login --email`, which sends
   you a 6-digit code. Approve that command too.
3. **You paste the code** into the chat. Codes expire after 10 minutes. A new
   email gets an account, a workspace at `opendocs.cc/<username>` and a Default
   project; an existing one signs in.
4. **It asks what you'd like to publish.** From here on you ask for documents,
   PDFs, shares and versions in your own words. See
   [What to ask your agent](../getting-started/what-to-ask.md).

Most agents ask before running a command. Approving the `npx`, `curl`, `npm`
and `opendocs` commands during setup is expected. If the `npx` install ends
with an error about PromptScript, that's a known installer bug that only
affects PromptScript; the skill is installed for your other agents.

## What your agent gets

| Piece | What it is | When it's used |
| --- | --- | --- |
| **The skill** | A `SKILL.md` file of instructions: the commands, plus rules like "ask before making anything public". See [The OpenDocs skill](../getting-started/skill-md.md). | Always. It's how your agent knows what to do when you mention a document, a PDF or a share. |
| **The CLI** | The `opendocs` command (`npm install -g @opendocs.cc/cli`, Node.js 20+). | The default way agents work: it handles sign-in, folders, local images, batching, exports and retries. |
| **The bash client** | `scripts/opendocs.sh` inside the skill folder. Needs only `curl` and `jq`. | Machines without Node.js. It covers sign-in, publish, list, pull, history, share, export, team invites and the theme. |
| **The MCP server** | `https://mcp.opendocs.cc/mcp`, which you sign in to with your OpenDocs account. See [MCP server](mcp.md). | Claude, ChatGPT and other apps that can't run commands. Coding tools can use it too, without installing anything. |
| **The REST API** | `https://api.opendocs.cc`, with an OpenAPI spec at `https://opendocs.cc/openapi.json`. | Agents and tools you build yourself, backend jobs, anything that can make an HTTP request. See [Authentication](../api-reference/authentication.md). |

Your agent can also read these docs directly: every page is available as
Markdown by adding `.md` to its URL, with an index at
`https://docs.opendocs.cc/llms.txt` and everything in one file at
`https://docs.opendocs.cc/llms-full.txt`.

## Under the hood

### Install the skill

```bash
# Node.js 22+: installs the skill for every agent it finds on this machine
npx skills add opendocs-cc/skills --skill opendocs -g -y

# Only for one agent (claude-code, codex, cursor, github-copilot, cline, openclaw, hermes-agent, gemini-cli, ...)
npx skills add opendocs-cc/skills --skill opendocs -g -y -a cursor

# No Node.js: SKILL.md + scripts/opendocs.sh into ~/.claude/skills/opendocs,
# and ~/.agents/skills/opendocs when ~/.agents or ~/.codex exists
curl -fsSL https://opendocs.cc/install.sh | bash

# Somewhere else (only that folder)
curl -fsSL https://opendocs.cc/install.sh | OPENDOCS_SKILL_DIR="$HOME/.hermes/skills/opendocs" bash

# Already have the CLI: every agent it finds, or the ones you name
opendocs agent --install
opendocs agent --install --agent cursor
```

Each agent page lists the folder that agent reads skills from. For agents
without skill support, print the instructions into the file the agent does
read: `opendocs agent` prints a short guide and `opendocs agent --full` prints
the whole skill.

### Install the CLI and sign in

```bash
npm install -g @opendocs.cc/cli                              # Node.js 20+
opendocs login --email dana@halvard.example --json           # emails a 6-digit code, exits
opendocs login --email dana@halvard.example --code 482913 --json
opendocs login --key od_live_xxxxx --json                    # an existing API key
```

The code login saves an API key named after the agent to
`~/.config/opendocs/config.json`. Never have an agent run bare
`opendocs login`: without `--email` or `--key` it waits for a key on stdin and
the tool call hangs. `opendocs login --browser` is for people at a terminal.

For CI and servers, log in once with a key from the dashboard. The CLI reads
`OPENDOCS_API_KEY` only during `login`, then uses the saved config:

```bash
OPENDOCS_API_KEY=od_live_xxxxx opendocs login --json
bash ~/.claude/skills/opendocs/scripts/opendocs.sh login --key od_live_xxxxx   # bash client
```

### Which agent published a version

Every version records the agent that published it, from the
`X-OpenDocs-Client` header. The CLI detects Claude Code, Cursor, Codex and
Gemini CLI on its own. Elsewhere it sends `opendocs-cli`; set the name with the
global `--client` flag or the `OPENDOCS_CLIENT` environment variable:

```bash
export OPENDOCS_CLIENT=cline
opendocs publish notes.md --client cline --json
```

API clients send the header themselves, for example
`X-OpenDocs-Client: cursor/finance-bot`.

### Defaults for any agent

| Practice | Why |
| --- | --- |
| Pass `--json` on every command | stdout becomes one JSON object; errors go to stderr with `error`, `message` and `docs_url`. |
| Write the Markdown to a file first | The CLI publishes files, not stdin, and you can review the file before it goes live. |
| Publish the same file again to update it | The CLI remembers what this folder published (`.opendocs/state.json`), so the URL stays the same and a new version is added. |
| Publish a folder in one command | `opendocs publish ./docs --tags q3-board --json` batches 25 docs per request. Don't loop per file. |
| Keep the default `workspace` visibility | Only workspace members can open it. `public` needs `--confirm-public` and a clear yes from you. |
| Put each URL on its own line in the reply | Chat clients glue trailing punctuation onto links. |

```bash
opendocs publish q3-investor-update.md --json
opendocs publish q3-investor-update.md --project investors --export pdf --json
opendocs publish ./board-pack --tags q3-board --json
opendocs share q3-investor-update.md sam@halvard.example --json
opendocs visibility q3-investor-update public --confirm-public --json   # only when asked
```

## Related pages

- [Quickstart](../getting-started/quickstart.md): the prompt, the code, your first document
- [MCP server](mcp.md): Claude, ChatGPT and other apps that connect over MCP
- [Tell your agent when to publish](agent-instructions.md): copy-paste instructions for `AGENTS.md`, `CLAUDE.md` and Cursor
- [The OpenDocs skill](../getting-started/skill-md.md): what it teaches and where it lives
- [Agent cookbook](../agents/cookbook.md): the exact commands for each job
- [Use the CLI yourself](../getting-started/cli-quickstart.md)
- [CLI reference](../cli/reference.md)
