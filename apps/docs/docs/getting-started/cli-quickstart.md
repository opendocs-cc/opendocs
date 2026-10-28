---
title: Use the CLI yourself
sidebar_position: 3
description: Install the OpenDocs CLI, sign in from your terminal, and publish and export Markdown without an agent.
---

# Use the CLI yourself

If you'd rather type the commands than ask an agent, the `opendocs` CLI does
everything your agent does: publish Markdown to a link, update it, export PDF
and Word files, and share it. These are the same commands your agent runs.
This page covers the handful you'll use most; the
[CLI reference](../cli/reference.md) has the rest.

## Install

```bash
npm install -g @opendocs.cc/cli     # Node.js 20+
opendocs --version                  # 0.4.7 or later
```

## Sign in

```bash
opendocs login --email dana@halvard.example                  # emails you a 6-digit code
opendocs login --email dana@halvard.example --code 482913
```

If the email is new, this creates your account, a workspace at
`opendocs.cc/<username>` and a Default project, and saves an API key in your
local config. Existing accounts sign in. Codes expire after 10 minutes. No
browser needed.

Other ways in:

```bash
opendocs login --browser               # approve the CLI from a signed-in browser
opendocs login --key od_live_xxxxx     # an API key from the dashboard
opendocs login                         # paste a key at the prompt
```

Check where you are:

```bash
opendocs whoami
```

It shows your username, the active workspace and project, and the API URL.
`opendocs whoami --json` adds your document quota.

## Publish

```bash
opendocs publish q3-investor-update.md
```

The first `# Heading` becomes the title, and you get a link like:

```text
opendocs.cc/halvard/q3-investor-update
```

The first part is your workspace's slug, not your username (see
[Usernames and workspace slugs](../api-reference/usernames.md)). Only members
of your workspace can open it until you change that.

Edit the file and publish it again from the same folder: the link stays the
same and you get a new version. The CLI remembers what each folder published in
`.opendocs/state.json`.

```bash
opendocs publish q3-investor-update.md     # again: version 2, same link
```

A more explicit first publish:

```bash
opendocs publish q3-investor-update.md \
  --title "Q3 investor update" \
  --slug q3-investor-update \
  --project investors \
  --tags investors,q3-2026
```

## Export

Publish and get a file in one step. The PDF lands next to the Markdown:

```bash
opendocs publish q3-investor-update.md --export pdf
```

Or export something already published:

```bash
opendocs export q3-investor-update --format pdf
opendocs export q3-investor-update --format docx -o ~/Desktop/q3-update.docx
```

`export` writes a PDF unless you pass `--format docx`. PDF works
on every plan with your workspace's export theme; Free PDFs have a "Made with
OpenDocs" footer. Word export and your own footer need Pro or Team. See
[PDF, Word and branding](../publishing/branded-exports.md).

## The commands that matter

| Command | What it does |
| --- | --- |
| `opendocs publish <files or folder>` | Publish; files this folder published before are updated. |
| `opendocs list` | Documents in the active project (`--all-projects`, `--all`, `--tag <tag>`). |
| `opendocs get <doc>` | Details of one document, including its URL and version. |
| `opendocs pull <doc>` | Download the Markdown (`--stdout` to print it, `--version <n>` for an old one). |
| `opendocs status` | What changed locally or online since the last sync. |
| `opendocs history <doc>` | Every version, who published it and through which agent. |
| `opendocs rollback <doc> <n>` | Publish version `n` again as a new version. |
| `opendocs share <doc> <email or @domain>` | Give people outside the workspace access to one document. |
| `opendocs visibility <doc> <level>` | `private`, `workspace` or `public` (public needs `--confirm-public`). |
| `opendocs project create <name> --use` | Start a project and make it active. |
| `opendocs workspace use <slug>` | Switch the active workspace. |
| `opendocs unpublish <doc>` | Hide a document (reversible). |
| `opendocs delete <doc>` | Delete it permanently. |

`<doc>` is a post ID, a slug from the URL, or a local `.md` file this folder
published. `opendocs get q3-investor-update` works if the active workspace has
a document at that slug.

## Publish a folder

Pass the folder, or several files, to one command:

```bash
opendocs publish ./board-pack --tags q3-board
opendocs publish ./board-pack --tags q3-board --export pdf
opendocs list --tag q3-board
```

Folders are recursive and skip `.obsidian`, `.trash`, `.git`, `.hg`,
`.opendocs` and `node_modules`, so an Obsidian vault works as is. The CLI sends
25 documents per request and takes up to 500 files per run. Running the same
command after edits updates the changed files and, with `--export`, writes a
fresh PDF for every file.

## Projects

Every workspace has a Default project. For a named body of work (a client, a
product, a launch), publish into a project:

```bash
opendocs publish ./board-pack --project "Board"      # a new name creates the project
opendocs project link "Board"                        # everything published from this folder goes there
opendocs project create "Investors" --slug investors --use
```

Default-project links look like `opendocs.cc/<workspace>/<slug>`; project
links look like `opendocs.cc/<workspace>/projects/<project>/<slug>`. See
[Projects](../publishing/projects.md).

## Several workspaces

The CLI keeps one active workspace at a time. Every `publish`, `update` and
`list` uses it:

```bash
opendocs workspace list           # the active one is marked with ✔
opendocs workspace use halvard-board
```

Switching only changes your local CLI config and resets the active project to
that workspace's Default project. The dashboard's active workspace is separate.

## Without an account

```bash
opendocs publish notes.md --anonymous
```

You get a link anyone can open for 24 hours, plus a claim link. Sign up later
from the same folder (or run `opendocs claim`) to keep it. See
[Share with people](../visibility/sharing-and-anonymous-links.md).

## Under the hood

- The CLI talks to `https://api.opendocs.cc` (override with `--api-url` or
  `OPENDOCS_API_URL`).
- Your login is saved in `~/.config/opendocs/config.json`, readable only by you
  (`0600`, in a `0700` folder).
- `--json` on any command prints one JSON object, for scripts. A publish
  returns `postId`, `slug`, `url` (a path like `/halvard/q3-investor-update`),
  `title` and `versionNumber`.
- In CI, log in once per job with a key. The CLI reads `OPENDOCS_API_KEY` only
  during `login`:

  ```bash
  OPENDOCS_API_KEY=od_live_xxxxx opendocs login --json
  opendocs publish ./docs --tags release --json
  ```

- Scripts and agents should never run bare `opendocs login`: it waits for a
  key on stdin. Use `--email`, `--key` or the variable above.
- `opendocs update <file> --post-id <doc>` updates a document this folder
  didn't publish (for example one published from another machine). Omitted
  `--visibility` and `--tags` keep their current values.

## Next steps

- [CLI reference](../cli/reference.md): every command and flag
- [Publish](../publishing/publish.md): the publish and update lifecycle
- [Sync a folder](../publishing/sync-and-history.md): clone, status and conflicts
- [How OpenDocs works](how-opendocs-works.md): workspaces, projects, documents and versions
- [Set up your agent](../integrations/overview.md): let your agent run all of this
