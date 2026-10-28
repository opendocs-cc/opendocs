---
title: Claude, ChatGPT and other apps (MCP)
description: Connect OpenDocs to Claude, ChatGPT, Claude Code, Codex, Cursor, VS Code and other AI apps with the OpenDocs MCP server. Sign in with your OpenDocs account, choose what the app may do, then ask in plain words.
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Claude, ChatGPT and other apps (MCP)

The OpenDocs MCP server lets Claude, ChatGPT and other AI apps publish, export,
share and send documents for you. You add one URL to the app, sign in with
your OpenDocs account and choose what the app may do. It works on every plan,
including Free.

```text
https://mcp.opendocs.cc/mcp
```

[opendocs.cc/mcp](https://opendocs.cc/mcp) has one-click buttons for Claude,
ChatGPT, Cursor and VS Code.

> **Ask your app**
>
> "Publish this as a doc in our Legal project."
>
> "Make a PDF of the Acme NDA."
>
> "Send the employment contract to Jón for signature."

:::tip MCP or the skill?
Chat apps such as Claude and ChatGPT use MCP. Coding tools such as Claude
Code, Codex and Cursor can use either. With a terminal, the
[skill and CLI](overview.md) are better for local files, folders and images:
they publish straight from disk and save PDFs next to the source. MCP needs
nothing installed.
:::

## Add OpenDocs to your app

<Tabs groupId="mcp-app" queryString="app">
<TabItem value="claude" label="Claude" default>

Works in Claude on the web, the desktop app and the mobile app. Add it once on
claude.ai and it's there in all of them.

1. Open the
   [Add custom connector dialog](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=OpenDocs.cc&connectorUrl=https%3A%2F%2Fmcp.opendocs.cc%2Fmcp)
   (the **Add to Claude** button on [opendocs.cc/mcp](https://opendocs.cc/mcp)
   opens the same link). The name `OpenDocs.cc` and the URL are filled in.
   Click **Add**.
2. Click **Connect** next to OpenDocs.cc, sign in to OpenDocs and click
   **Allow**. See [Signing in](#signing-in) for what you'll see.
3. Ask in any chat.

To add it by hand, open Claude's connector settings, choose **Add custom
connector**, name it `OpenDocs.cc` and paste `https://mcp.opendocs.cc/mcp`.

- **Team and Enterprise:** an owner adds OpenDocs once in Organization
  settings → Connectors
  ([prefilled link](https://claude.ai/admin-settings/connectors?modal=add-custom-connector&connectorName=OpenDocs.cc&connectorUrl=https%3A%2F%2Fmcp.opendocs.cc%2Fmcp)).
  Then each person clicks **Connect** and signs in with their own OpenDocs
  account.
- **Claude Free** allows one custom connector.
- Connectors you add on claude.ai also show up in Claude Code when you're
  signed in with the same account.

</TabItem>
<TabItem value="chatgpt" label="ChatGPT">

OpenDocs.cc is in ChatGPT's plugin directory.

1. Open
   [OpenDocs.cc in ChatGPT](https://chatgpt.com/plugins/plugin_asdk_app_6adfe2405774819198b9b9c92fffaaa8)
   (the **Add to ChatGPT** button on [opendocs.cc/mcp](https://opendocs.cc/mcp)
   opens the same page), or search for OpenDocs.cc in ChatGPT's plugins. Click
   **Install plugin**.
2. ChatGPT opens OpenDocs: sign in and click **Allow**. See
   [Signing in](#signing-in) for what you'll see.
3. Ask in any chat.

On a work account, your ChatGPT admin may need to allow OpenDocs.cc first.

To add it by hand instead, open **Settings → Plugins**
([chatgpt.com/plugins](https://chatgpt.com/plugins)), click **+** and choose
**Add custom MCP server**. Name it `OpenDocs.cc`, paste
`https://mcp.opendocs.cc/mcp`, choose OAuth and click **Create as plugin**.
This needs a ChatGPT plan that supports custom MCP servers.

</TabItem>
<TabItem value="claude-code" label="Claude Code">

```bash
claude mcp add --transport http --scope user opendocs https://mcp.opendocs.cc/mcp
```

Then run `/mcp` in Claude Code, choose `opendocs` and sign in to OpenDocs in
the browser that opens. `--scope user` makes it available in every project.

If you already added OpenDocs.cc on claude.ai, it shows up in Claude Code for
the same account and you can skip the command.

</TabItem>
<TabItem value="codex" label="Codex">

The Codex CLI, the IDE extension and the ChatGPT desktop app share one
configuration, so this sets up all three.

```bash
codex mcp add opendocs --url https://mcp.opendocs.cc/mcp
codex mcp login opendocs
```

The second command opens your browser to sign in to OpenDocs. To edit the
config by hand, add this to `~/.codex/config.toml` and then run
`codex mcp login opendocs`:

```toml title="~/.codex/config.toml"
[mcp_servers.opendocs]
url = "https://mcp.opendocs.cc/mcp"
```

</TabItem>
<TabItem value="cursor" label="Cursor">

Click **Add to Cursor** on [opendocs.cc/mcp](https://opendocs.cc/mcp). Cursor
opens and shows the server; click **Install**. Or add it to
`~/.cursor/mcp.json` yourself (inside `mcpServers` if you already have
servers):

```json title="~/.cursor/mcp.json"
{
  "mcpServers": {
    "opendocs": {
      "url": "https://mcp.opendocs.cc/mcp"
    }
  }
}
```

Cursor's MCP settings then show that `opendocs` needs you to sign in. Click it
and allow access in the browser that opens.

</TabItem>
<TabItem value="vscode" label="VS Code">

Click **Install in VS Code** on [opendocs.cc/mcp](https://opendocs.cc/mcp), or
run:

```bash
code --add-mcp '{"name":"opendocs","type":"http","url":"https://mcp.opendocs.cc/mcp"}'
```

Or add it to your `mcp.json` (**MCP: Open User Configuration** in the Command
Palette, or `.vscode/mcp.json` to share it with a project):

```json title="mcp.json"
{
  "servers": {
    "opendocs": {
      "type": "http",
      "url": "https://mcp.opendocs.cc/mcp"
    }
  }
}
```

Start the server when VS Code asks and sign in to OpenDocs in the browser. Then
use Copilot Chat in agent mode.

</TabItem>
<TabItem value="more" label="More apps">

**Windsurf (Devin Desktop)** uses `serverUrl` in its MCP config,
`mcp_config.json`:

```json title="mcp_config.json"
{
  "mcpServers": {
    "opendocs": {
      "serverUrl": "https://mcp.opendocs.cc/mcp"
    }
  }
}
```

**Antigravity** (which replaced Gemini CLI) takes the same JSON in
`~/.gemini/config/mcp_config.json`. On the older Gemini CLI, run:

```bash
gemini mcp add --transport http opendocs https://mcp.opendocs.cc/mcp
```

**Zed** goes in `settings.json`:

```json title="settings.json"
{
  "context_servers": {
    "opendocs": {
      "url": "https://mcp.opendocs.cc/mcp"
    }
  }
}
```

**JetBrains AI Assistant**, and any app that only runs local (stdio) servers,
can connect through [`mcp-remote`](https://www.npmjs.com/package/mcp-remote),
which needs Node.js and signs you in through your browser:

```json
{
  "mcpServers": {
    "opendocs": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.opendocs.cc/mcp"]
    }
  }
}
```

**Raycast:** run **Install MCP Server**, name it `opendocs` and paste the URL.

**Any other app:** add a remote MCP server (Streamable HTTP) with the URL
`https://mcp.opendocs.cc/mcp` and sign in when the app asks.

</TabItem>
</Tabs>

### With the OpenDocs CLI

If you have the [CLI](../cli/reference.md), it can do the setup for you:

```bash
opendocs mcp add               # adds the server to every coding tool it finds
opendocs mcp connect claude    # opens Claude's add dialog and copies the URL
opendocs mcp connect chatgpt   # opens ChatGPT's plugin settings and copies the URL
```

`opendocs mcp add` uses each tool's own command where there is one (`claude mcp
add`, `codex mcp add`, `code --add-mcp`) and otherwise adds only the
`opendocs` entry to the tool's config, leaving your other servers alone. Each
tool then asks you to sign in the first time it uses OpenDocs.

## Signing in

The first time the app uses OpenDocs, it opens an OpenDocs page in your
browser:

1. **Sign in** with an emailed code, Google or GitHub. New to OpenDocs? The
   same page creates your account, a workspace and a Default project.
2. **Check who's asking.** The page names the app ("Claude wants to use your
   OpenDocs account") and the account you're signed in as, with a link to use
   another account.
3. **Pick a workspace** if you have more than one. Pending invitations to a
   workspace show up here too.
4. **Choose permissions** (below) and click **Allow**.

You're sent back to the app, which shows OpenDocs as connected. OpenDocs
remembers your answer for that app and set of permissions, so reconnecting
doesn't ask again.

## Permissions

| Permission | What it allows | Default |
| --- | --- | --- |
| **Read documents** | Read your documents and projects | Always on |
| **Create, update, share and export** | Publish and change documents, share them, export PDF and Word files | On |
| **Google Drive and e-signature** | Save documents to Google Drive and send them for e-signature | On when your workspace has Drive or DocuSeal connected |
| **Team and workspace admin** | Manage team members, workspaces and export branding | Off; only offered to owners and admins |

The app only sees the tools your permissions allow. To allow more later,
reconnect OpenDocs from the app (or disconnect it in Connected apps and add it
again) and tick the permission on the consent screen. The full list is in
[MCP tools](../reference/mcp-tools.md).

Your plan's usual limits apply, the same as with the CLI. Google Drive and
e-signatures need a workspace on Pro or Team with them connected; see
[Google Drive](google-drive.md) and [E-signatures with DocuSeal](docuseal.md).

## What the AI asks you first

OpenDocs tells the AI to ask you in plain words, and get a clear yes, before it:

- makes a document public,
- deletes a document or project,
- invites people or removes them from the team,
- changes the export theme, which affects every export,
- sends anything for signature.

For e-signatures it always creates a draft first and reads back the document,
version, every signer, the order, the message and the expiry. If your workspace
requires approval in the browser, you get an approval link instead. Your app
may also ask you to approve tool calls on its own.

Every answer ends with the document's link on its own line and who can open
it.

## What works differently from the CLI

| With the CLI | Over MCP |
| --- | --- |
| Publishes a `.md` file from disk | The AI sends the Markdown itself. Word files you upload to the chat are converted to Markdown first. |
| Uploads local images | Image links in the Markdown are copied to OpenDocs when you publish. Pasted images go through an upload tool. |
| Saves the PDF or Word file next to the source | You get a download link that works for 60 minutes. |
| Remembers which file is which document | The AI refers to documents by link, slug or title, and updates check the version so nobody's edits are overwritten. |
| Publishes whole folders | Up to 25 documents per request. Whole folders and vaults stay a CLI job. |

## Disconnect

Open [Dashboard → Connected apps](https://opendocs.cc/dashboard/connected-apps)
and click **Revoke** next to the app. Its access ends within a minute. You can
also remove the connector in the app itself; revoking in OpenDocs makes sure it
can't be used again.

## Troubleshooting

**The app says it needs to sign in again.** This happens after you revoke the
app, or when you ask for something your permissions don't cover. Reconnect and
allow the permission:

- Claude: open the connector settings, disconnect OpenDocs.cc and click
  **Connect** again.
- ChatGPT: open **Settings → Plugins**, disconnect OpenDocs.cc and connect it
  again.
- Claude Code: run `/mcp`, choose `opendocs` and sign in again.
- Codex: run `codex mcp login opendocs`.
- Cursor and VS Code: sign in again from the MCP settings.

**The sign-in page says "Unverified app".** Some apps, mostly coding tools,
register themselves when they first connect. OpenDocs then shows the name the
app gave itself, the address it returns to after sign-in and an "Unverified
app" note. Claude, ChatGPT and VS Code identify themselves and get a verified
badge. If the name or address doesn't match the app you're using, click
**Cancel**.

**Claude says you can't add another connector.** Claude Free allows one
custom connector. Remove the other one first, or use a Claude plan that allows
more.

**You can't install OpenDocs.cc in ChatGPT.** On a work account, an admin may
need to allow it first. Adding it by hand needs a ChatGPT plan or workspace
that supports custom MCP servers.

**The AI doesn't use OpenDocs.** Check that the connector is turned on for this
chat, then mention OpenDocs in your request: "Publish this with OpenDocs."

**It doesn't connect from a work computer.** Claude and ChatGPT connect to
OpenDocs from their own servers, so only the sign-in page has to load on your
computer. Coding tools connect from your computer: they need HTTPS access to
`mcp.opendocs.cc` and `opendocs.cc`. Proxies that strip the `Authorization`
header or buffer streamed responses break MCP; ask IT to allow both hosts.

## Privacy

OpenDocs only receives what the AI sends to its tools: the text of a document
you publish, the email of someone you share with, the folder you save to. It
never sees your chats, your other files or your other connectors. What it keeps
is the same as when you publish from the CLI: your documents, their versions
and who has access. Version history shows which app published each version,
such as "Published from Claude". See the
[Privacy Policy](https://opendocs.cc/privacy).

## For developers

| What | Where |
| --- | --- |
| Server URL | `https://mcp.opendocs.cc/mcp` (Streamable HTTP) |
| OAuth issuer | `https://opendocs.cc/api/auth` |
| Authorization server metadata | `https://opendocs.cc/.well-known/oauth-authorization-server/api/auth` |
| Protected resource metadata | `https://mcp.opendocs.cc/.well-known/oauth-protected-resource/mcp` |

Clients discover the authorization server from the protected resource metadata,
so the URL is all an MCP client needs. Access tokens are issued for the MCP
server; to call the REST API directly, use an API key (see
[Authentication](../api-reference/authentication.md)).

## Related pages

- [MCP tools](../reference/mcp-tools.md): every tool, grouped by what it does
- [Set up your agent](overview.md): the skill and CLI for coding tools
- [What to ask your agent](../getting-started/what-to-ask.md)
- [Google Drive](google-drive.md) and [E-signatures with DocuSeal](docuseal.md)
