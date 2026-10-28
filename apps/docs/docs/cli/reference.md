---
title: CLI reference
sidebar_position: 1
description: Every command, subcommand and flag in the OpenDocs CLI 0.4.7, with defaults, JSON output, environment variables, files and exit codes.
---

# CLI reference

Most people never type these commands: you ask your agent in plain language and it
runs them for you. This page is for agents, and for anyone who wants the detail.
Agents should pass `--json` on every command and read the JSON instead of the
terminal text. This page matches CLI version 0.4.7.

## Install

```bash
npm install -g @opendocs.cc/cli          # Node.js 20 or later
opendocs login --email dana@halvard.example
opendocs login --email dana@halvard.example --code 123456
```

No Node.js? `curl -fsSL https://opendocs.cc/install.sh | bash` installs the agent
skill with a bash client (`scripts/opendocs.sh` in the skill folder, using `curl`
and `jq`) that covers `login`, `whoami`, `publish`, `list`, `pull`, `history`,
`share`, `export`, `claim`, `team` and `theme`.

## Global flags

These work on every command, before or after the subcommand
(`opendocs list --json`).

| Flag | Default | Notes |
| --- | --- | --- |
| `--json` | Off | One JSON object on stdout; errors as JSON on stderr. Spinners, colors and hints are off. |
| `--api-url <url>` | Saved URL, else `https://api.opendocs.cc` | API for this command. `opendocs login` saves the URL it used. |
| `--client <name>` | Detected | The agent shown on published versions, sent as the `X-OpenDocs-Client` header. Detected: `claude-code`, `cursor`, `codex`, `gemini`, `opencode`; otherwise `opendocs-cli`. |
| `-h`, `--help` | | Help for any command or subcommand. |
| `-V`, `--version` | | Print the CLI version. After a subcommand, `--version <n>` is a document version instead (`pull`, `save`, `sign request`). |

## Environment variables

| Variable | Used by | Notes |
| --- | --- | --- |
| `OPENDOCS_API_KEY` | `opendocs login` | Used when `--key` isn't given: the key is checked and saved to the config. Other commands read the saved config, not this variable, so in CI run `opendocs login --json` first. |
| `OPENDOCS_API_URL` | `opendocs login`, `publish --anonymous` | API URL when there's no `--api-url`. `login` saves it to the config; after that the saved URL is used. |
| `OPENDOCS_WEB_URL` | `opendocs login --browser` | Web app to open. Defaults to the one matching the API URL (`https://opendocs.cc`). |
| `OPENDOCS_CLIENT` | Every command | Same as `--client`. |
| `XDG_CONFIG_HOME` | Every command | Moves the config file to `$XDG_CONFIG_HOME/opendocs/config.json`. |

```bash
# CI with an existing key
OPENDOCS_API_KEY=od_live_xxxxx opendocs login --json
opendocs publish docs/ --json
```

## Files

| File | What it holds |
| --- | --- |
| `~/.config/opendocs/config.json` | API key, API URL, user, active workspace and project, and the `organize` preference. Written by `login` and by commands that switch the active workspace or project or change a preference; removed by `logout`. Readable only by you (mode 600). |
| `.opendocs/state.json` | Per folder: which local file is which document and version, the folder's project link, and claim tokens for anonymous documents. Written by `publish`, `clone`, `project link`, and `pull` when the file exists. Commands look for it in the current folder and its parents, up to your home folder. The CLI writes a `.gitignore` next to it so it stays out of git. |

## Output and exit codes

With `--json`, a successful command prints one JSON object to stdout. A failure
prints one JSON object to stderr and exits 1:

```json
{ "error": "destination_not_found", "message": "No folder named \"Minutes\". This workspace's folders: \"Board Minutes\", \"HR Policies\".", "destinations": ["Board Minutes", "HR Policies"] }
```

Some errors carry extra fields an agent can act on: `destinations`, `roles`,
`approveUrl`, `status`, `provider`.

| Exit code | Meaning |
| --- | --- |
| `0` | Success. |
| `1` | The command failed, or a usage error such as a missing required flag. `invite` and `team invite` also exit 1 when any address failed. `publish` also does when it stopped part-way (`aborted: true`), or when some updates of already-published files or some anonymous files failed. |
| `130` | Interrupted with Ctrl-C at the hidden API key prompt. |

A multi-file `publish` or `export` in which some files failed can still exit 0.
Check `failed` (and each `results[].success`) in the JSON.

Command-line usage errors (an unknown flag, a missing required option) print
plain text even with `--json`. Everything else, including `not_logged_in`, is JSON.

When the API rejects the saved key (`401`), the CLI deletes the saved config and
returns `auth_expired`. Sign in again.

## Rate limits and retries

When the API answers `429` with a `Retry-After` of 90 seconds or less, the CLI waits
that long and sends the request again, up to five times, so a big publish or export
slows down instead of failing part-way (CLI 0.4.6 and later). In a terminal the
spinner shows "rate limited, retrying in 12s"; with `--json` it waits silently.
Longer waits, such as the hourly anonymous publish limit, come back as an error
straight away. The limits are on [Plans and limits](../getting-started/plans-and-limits.md#rate-limits).

## Document arguments

Commands that take `<doc>` or `<idOrSlug>` accept a post ID (UUID), a slug in the
active workspace, or a local `.md` file this folder published or cloned (looked up
in `.opendocs/state.json`).

## Account

### `opendocs login`

Sign in or create an account. Alias: `opendocs signup`.

```bash
opendocs login --email dana@halvard.example                # emails a 6-digit code
opendocs login --email dana@halvard.example --code 123456  # verifies it, saves a key
opendocs login --browser
opendocs login --key od_live_xxxxx
OPENDOCS_API_KEY=od_live_xxxxx opendocs login
```

| Flag | Default | Notes |
| --- | --- | --- |
| `--email <email>` | | Email a sign-in code. Works for new and existing accounts. |
| `--code <code>` | | The 6-digit code from the email. Needs `--email`. |
| `--key-name <name>` | The detected agent, e.g. `claude-code` | Name of the API key an `--email` login creates. |
| `--key <key>` | `OPENDOCS_API_KEY` | An existing API key (`od_live_…`) to check and save. |
| `--browser` | | Approve the CLI in your browser; creates an API key. |
| `--web-url <url>` | `OPENDOCS_WEB_URL`, else matched to the API URL | Web app for `--browser`. |

- `--email` without `--code` sends the code. Without a terminal (agents, CI) or
  with `--json`, it stops there and prints the next command.
- With `--code`, a new email gets an account, a username, a workspace at
  `opendocs.cc/<username>`, a Default project and an API key. Anonymous documents
  published from this folder are claimed into the new workspace.
- With none of `--email`, `--key`, `--browser` or `OPENDOCS_API_KEY`, it waits for
  a key at a hidden prompt. Never run bare `opendocs login` from an agent.
- After any login, pending workspace invitations are listed
  (`pendingInvitations`); join with `opendocs team join`.

`--email` without `--code`, with `--json`:

```json
{
  "status": "code_sent",
  "email": "dana@halvard.example",
  "accountExists": false,
  "expiresInSeconds": 600,
  "next": "opendocs login --email dana@halvard.example --code <6-digit code from the email>"
}
```

`--email` with `--code`:

```json
{
  "success": true,
  "accountCreated": true,
  "email": "dana@halvard.example",
  "username": "dana",
  "workspaceId": "…",
  "workspaceSlug": "dana",
  "projectId": "…",
  "keyName": "claude-code",
  "claimed": [],
  "pendingInvitations": []
}
```

`--key`, `--browser` or `OPENDOCS_API_KEY`:

```json
{ "success": true, "username": "dana", "workspaceId": "…", "projectId": "…", "pendingInvitations": [] }
```

### `opendocs logout`

Delete the saved config (API key, workspace and project).

```bash
opendocs logout --json     # {"success": true}
```

### `opendocs whoami`

Check the saved key and show the account, active workspace, active project, API
URL and document quota.

```bash
opendocs whoami --json
```

```json
{
  "userId": "…",
  "onboarding": {
    "username": "dana",
    "workspace": { "id": "…", "name": "Halvard", "slug": "halvard" }
  },
  "quota": { "documents": { "plan": "pro", "limit": null, "used": 42, "remaining": null } },
  "project": { "id": "…", "name": "Default", "slug": "default" },
  "folderProject": null,
  "organize": "ask"
}
```

`onboarding.workspace` is the CLI's active workspace. `folderProject` is this
folder's [project link](#opendocs-project), if any.

## Publishing

### `opendocs publish <files...>`

Publish Markdown files or folders. Files this folder already published are updated
in place, not duplicated.

```bash
opendocs publish q3-investor-update.md --json
opendocs publish docs/*.md --tags api-docs --json
opendocs publish ./vault --project "Board" --json
opendocs publish q3-investor-update.md --export pdf --json
opendocs publish notes.md --anonymous --json
```

| Flag | Default | Notes |
| --- | --- | --- |
| `--title <title>` | First `# Heading` | Single file only. |
| `--slug <slug>` | From the title | Single file only. |
| `--visibility <level>` | `workspace` | `private`, `workspace` or `public`. On an update, the current visibility is kept unless you pass this flag. |
| `--confirm-public` | | Required with `--visibility public`. |
| `--tags <tags>` | | Comma-separated, applied to every file. At most 20 per document. |
| `--project <project>` | See below | Project name, slug or ID. A new name creates the project. |
| `--export <format>` | | `pdf` or `docx`. After publishing, writes the export next to each source file (`report.md` → `report.pdf`). Exports every file the run published or updated, including unchanged ones. |
| `--anonymous` | | Publish without an account: anyone with the link can read it for 24 hours. Returns a claim URL. Up to 10 files. Ignores `--visibility`, `--tags`, `--project` and `--export`. |
| `--new` | | Always create new documents, even for files this folder already published. |
| `--force` | | Overwrite the live version even if someone published a newer one since your last sync. Without it, that file reports `version_conflict` and is left alone. |

New files go to: `--project`, else the project named by the file's
`projects/<slug>/` path inside a cloned workspace, else the folder's
`project link`, else the active project. `projectSource` in the result says which
(`flag`, `path`, `folder`, `active`).

Folders are scanned recursively for `.md` files, skipping `.git`, `.hg`,
`.obsidian`, `.opendocs`, `.trash` and `node_modules`. Local images next to the
Markdown are uploaded and their links rewritten.

| Limit | Value |
| --- | --- |
| Markdown per file | 1 MB |
| Files per command | 500 |
| Documents per API batch | 25 (the CLI splits larger runs) |
| Local images per document | 30, up to 10 MB each (JPEG, PNG, WebP, GIF, SVG) |
| Anonymous files per command | 10 |

One new file:

```json
{
  "postId": "…",
  "slug": "q3-investor-update",
  "url": "/halvard/projects/investors/q3-investor-update",
  "title": "Q3 investor update",
  "versionNumber": 1,
  "projectId": "…",
  "projectSlug": "investors",
  "projectName": "Investors",
  "isDefaultProject": false,
  "projectSource": "flag"
}
```

With `--export`, the result also has
`"export": { "format": "pdf", "path": "q3-investor-update.pdf", "bytes": 48213, "success": true }`.

Several files, or files this folder already published:

```json
{
  "total": 2,
  "succeeded": 2,
  "failed": 0,
  "results": [
    { "success": true, "file": "docs/intro.md", "postId": "…", "slug": "intro", "url": "/halvard/intro", "title": "Intro" }
  ],
  "updated": [
    { "file": "docs/guide.md", "success": true, "action": "updated", "postId": "…", "url": "/halvard/guide", "versionNumber": 4 }
  ]
}
```

`updated[].action` is `updated`, `unchanged`, `conflict` or `failed`. With
`--export`, an `export` block lists each file's `path`.

### `opendocs update <file>`

Publish a file as a new version of a specific document. The URL stays the same.

```bash
opendocs update revised.md --post-id q3-investor-update --json
```

| Flag | Default | Notes |
| --- | --- | --- |
| `--post-id <idOrSlug>` | Required | The document to update. |
| `--title <title>` | First `# Heading` | |
| `--visibility <level>` | Current | `private`, `workspace` or `public`. |
| `--confirm-public` | | Required when changing to public. |
| `--tags <tags>` | Current | Replaces the tags with this comma-separated list. |

```json
{
  "postId": "…",
  "versionId": "…",
  "versionNumber": 4,
  "slug": "q3-investor-update",
  "url": "/halvard/projects/investors/q3-investor-update",
  "title": "Q3 investor update",
  "visibility": "workspace",
  "projectSlug": "investors"
}
```

`unchanged: true` means the content was identical and no new version was made.

### `opendocs visibility <idOrSlug> <level>`

Change who can read a document without uploading anything. `<level>` is
`private`, `workspace` or `public`.

```bash
opendocs visibility q3-investor-update private --json
opendocs visibility q3-investor-update public --confirm-public --json
```

| Flag | Notes |
| --- | --- |
| `--confirm-public` | Required for `public`. Without it: `confirm_public_required`. |

### `opendocs unpublish <idOrSlug>`

Take a document offline, keeping its content, version history and slug. It can't
be republished: to bring it back, publish the file as a new document (`--new`).
Unpublished documents don't count toward the Free plan's 50.

```bash
opendocs unpublish q3-investor-update --json
```

### `opendocs delete <idOrSlug>`

Permanently delete a document and its history. Can't be undone; the slug becomes
free to reuse.

```bash
opendocs delete q3-investor-update --yes --json
```

| Flag | Notes |
| --- | --- |
| `-y`, `--yes` | Skip the confirmation prompt. Required outside a terminal, or it fails with `confirm_required` before any request is made. |

## Reading and exporting

### `opendocs list`

List documents in the active project, newest first. Alias: `opendocs ls`.

```bash
opendocs list --json
opendocs list --all-projects --limit 100 --json
opendocs list --project investors --tag q3 --json
opendocs list --all --json
```

| Flag | Default | Notes |
| --- | --- | --- |
| `--page <n>` | `1` | |
| `--limit <n>` | `20` | At most 100. |
| `--tag <tag>` | | Only documents with this tag. |
| `--project <slugOrId>` | Active project | One project, by slug, ID or name. |
| `--all-projects` | | Every project in the active workspace. |
| `--all` | | Every workspace you belong to. |

```json
{
  "posts": [
    {
      "id": "…",
      "title": "Q3 investor update",
      "slug": "q3-investor-update",
      "visibility": "workspace",
      "isPublished": true,
      "workspaceSlug": "halvard",
      "tags": ["investors"],
      "updatedAt": "2026-10-24T12:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 },
  "scope": "workspace",
  "workspaceSlug": "halvard",
  "projectSlug": "default",
  "otherProjects": [{ "name": "Investors", "slug": "investors", "postCount": 6 }]
}
```

`scope` is `all` with `--all`. `otherProjects` (only when the list is scoped to one
project) shows which other projects have documents, so a short list isn't mistaken
for the whole workspace.

### `opendocs get <idOrSlug>`

Show one document: URL, ID, slug, project, visibility, published state, version and
tags.

```bash
opendocs get q3-investor-update --json
```

```json
{
  "post": {
    "id": "…",
    "slug": "q3-investor-update",
    "title": "Q3 investor update",
    "url": "/halvard/projects/investors/q3-investor-update",
    "projectSlug": "investors",
    "visibility": "workspace",
    "isPublished": true,
    "versionNumber": 4,
    "tags": ["investors"]
  }
}
```

### `opendocs pull [idOrSlug]`

Download Markdown for one document, a project, or the whole workspace.

```bash
opendocs pull q3-investor-update                      # writes q3-investor-update.md
opendocs pull q3-investor-update --stdout
opendocs pull q3-investor-update --version 2 --stdout
opendocs pull --project investors --output ./investors
opendocs pull --workspace --output ./halvard --dry-run
```

| Flag | Default | Notes |
| --- | --- | --- |
| `-o`, `--output <path>` | `<slug>.md` / current folder | A file for one document, a folder for bulk pulls. |
| `--stdout` | | Print one document's Markdown to stdout. |
| `--version <n>` | Latest | An earlier version of one document (see `opendocs history`). |
| `--project [slugOrId]` | | Bulk: the active project, or the one named. |
| `--workspace` | | Bulk: every project. Default-project documents go at the top, others under `projects/<project>/`. |
| `--tag <tag>` | | Bulk: only documents with this tag. |
| `--overwrite` | | Bulk: replace existing files (otherwise it refuses). |
| `--dry-run` | | Bulk: show what would be written. |

Pass a document or bulk flags, not both. Pulling the latest version into a tracked
file brings it back in sync.

### `opendocs export [idsOrSlugs...]`

Export documents to Word or PDF files.

```bash
opendocs export q3-investor-update --format pdf
opendocs export intro guide faq --format pdf --output ./exports
opendocs export --project investors --format pdf
opendocs export q3-investor-update --format pdf --stdout > update.pdf
```

| Flag | Default | Notes |
| --- | --- | --- |
| `-f`, `--format <format>` | `pdf` | `pdf` or `docx`. Word export needs Pro or Team (`docx_requires_pro` on Free). Before 0.4.7 the default was `docx`. |
| `-o`, `--output <path>` | `<slug>.<format>` / current folder | A file for one document, a folder for several. |
| `--project <slugOrId>` | | Export every document in a project, into `-o` (default `./<project>-<format>`). Not with document arguments or `--stdout`. |
| `--stdout` | | Write the file to stdout. One document only. |
| `--landscape` | | Landscape A4. |
| `--accent-color <hex>` | Workspace theme | Override the accent color for this export, e.g. `#B91C1C`. |

Up to 10 documents per command (`too_many_posts` above that); `--project` exports
in batches of 10. One document:

```json
{ "postId": "…", "format": "pdf", "filename": "q3-investor-update.pdf", "bytes": 48213 }
```

`filename` is the path written. Several documents:
`{ format, total, succeeded, failed, results }`.

## Sync and history

### `opendocs clone [dir]`

Download a workspace, or one project, into a folder linked for re-publishing:
`opendocs publish .` there updates the same documents.

```bash
opendocs clone ./halvard --json
opendocs clone --project investors --json
```

| Flag | Default | Notes |
| --- | --- | --- |
| `[dir]` | The workspace or project slug | Target folder. |
| `--project <slugOrId>` | | Clone one project and link the folder to it. |
| `--tag <tag>` | | Only documents with this tag. |
| `--overwrite` | | Replace files that already exist (otherwise `file_exists`). |

### `opendocs status`

Show what changed locally or online since the last publish, pull or clone, for every
`.md` file under the folder that holds `.opendocs/state.json`.

```bash
opendocs status --json
```

Each file is `up-to-date`, `modified` (changed locally), `behind` (newer version
online), `conflict` (changed on both sides), `missing-locally`, `gone-remotely`,
`untracked` (not published) or `anonymous`. JSON:
`{ root, workspaceSlug, files, summary }`. Without a state file: `no_state`.

### `opendocs history <doc>`

List every version of a document, newest first, with who published it and through
which agent.

```bash
opendocs history q3-investor-update.md --json
```

### `opendocs rollback <doc> <version>`

Publish an earlier version again as a new version, so it can be undone too. Alias:
`opendocs restore`. Your local file isn't changed; pull to get the restored content.

```bash
opendocs rollback q3-investor-update 3 --json
```

## Organizing

### `opendocs project`

Projects group documents inside a workspace, like branches in a repo. Default-project
URLs are `/<workspace>/<slug>`; others are `/<workspace>/projects/<project>/<slug>`.

```bash
opendocs project list --json
opendocs project current --json
opendocs project create "Investors" --slug investors --use --json
opendocs project use investors --json
opendocs project rename investors --name "Investor relations" --json
opendocs project delete investors --yes --json
opendocs project link "Board" --json
opendocs project unlink --json
```

| Subcommand | Flags | Notes |
| --- | --- | --- |
| `list` (`ls`) | | Projects with document counts. JSON: `{ projects, activeProjectId, folderProject }`. |
| `current` | | The project this folder publishes to: its link, else the active project. JSON `source` is `folder` or `active`. |
| `create <name>` | `--slug <slug>`, `--use` | `--use` makes it the active project. |
| `use <slugOrId>` (`switch`) | | Set the CLI's active project. Local only. |
| `rename <slugOrId>` | `--name <name>` (required), `--slug <slug>` | Changing the slug changes the project's URLs. |
| `delete <slugOrId>` | `-y`, `--yes` | Only empty, non-default projects. Asks first in a terminal; elsewhere fails with `confirm_required` without `--yes`. |
| `link <nameOrSlug>` | | Link the current folder to a project (created if the name is new). New documents published from this folder go there. |
| `unlink` | | Remove this folder's link. Publishing falls back to the active project. |

### `opendocs move <doc>`

Move a document to another project. Its URL changes; its content doesn't. If the
slug is taken in the target project, the document gets a new one.

```bash
opendocs move q3-investor-update --project investors --json
```

| Flag | Notes |
| --- | --- |
| `--project <nameOrSlug>` | Required. Project name, slug or ID; a new name creates the project. |

### `opendocs config`

Preferences agents follow across sessions. Today there's one, `organize`: how
readily an agent sorts documents into projects.

```bash
opendocs config get --json                 # {"organize": "ask"}
opendocs config set organize auto --json
```

| Value | Meaning |
| --- | --- |
| `ask` (default) | Agents suggest a new project when the topic changes, and ask first. |
| `auto` | Agents create and pick projects on their own, and say where things went. |
| `off` | Agents publish to the active project only. |

## Sharing and teams

### `opendocs share <doc> [people...]`

Share a document with people outside the workspace, by email or a whole `@domain`.
They verify their email with a code and see only that document. With no people,
lists who it's shared with.

```bash
opendocs share q3-investor-update sam@northwind.example @northwind.example --json
opendocs share q3-investor-update --json
opendocs share q3-investor-update sam@northwind.example --remove --json
```

| Flag | Default | Notes |
| --- | --- | --- |
| `--remove` | | Stop sharing with these people or domains. |
| `--no-notify` | Emails are sent | Don't email the people you add. |

### `opendocs claim [claimUrlOrToken]`

Keep anonymous documents by moving them into the active workspace (and active
project). With no argument, claims everything this folder published anonymously.

```bash
opendocs claim --json
opendocs claim https://opendocs.cc/claim/abc123 --visibility private --json
```

| Flag | Default | Notes |
| --- | --- | --- |
| `--visibility <level>` | `workspace` | `private` or `workspace`. Applies when you pass a claim URL or token. |

Claimed files from this folder become tracked, so publishing them again updates the
claimed documents.

### `opendocs workspace`

```bash
opendocs workspace list --json
opendocs workspace use halvard --json
opendocs workspace create "Halvard Research" --slug halvard-research --json
opendocs workspace members --json
```

| Subcommand | Flags | Notes |
| --- | --- | --- |
| `list` (`ls`) | | Workspaces you belong to, with your role. JSON: `{ workspaces, activeSlug }`. |
| `use <slug>` (`switch`) | | Set the CLI's active workspace and its Default project. Local only; the dashboard isn't affected. |
| `create <name>` | `--slug <slug>`, `--no-switch` | Create a workspace and switch to it, unless `--no-switch`. |
| `members` | | Members of the active workspace. |

### `opendocs team`

Members, invitations and auto-join for the active workspace, and invitations sent to
you. With no subcommand, same as `team list`.

```bash
opendocs team list --json
opendocs team invite sam@halvard.example --role admin --json
opendocs team invitations --json
opendocs team join halvard --json
opendocs team auto-join add halvard.example --json
```

| Subcommand | Flags | Notes |
| --- | --- | --- |
| `list` (`ls`) | | Members, pending invitations and auto-join domains. |
| `invite <emails...>` | `--role <role>` (default `member`) | `member` or `admin`. People get an email and must accept. |
| `revoke <email>` | | Cancel a pending invitation. |
| `resend <email>` | | Email a pending invitation again. |
| `role <email> <role>` | | Change a member's role to `admin` or `member`. |
| `remove <email>` | `-y`, `--yes` | Remove a member. `--yes` is required outside a terminal. |
| `leave` | `-y`, `--yes` | Leave the active workspace. `--yes` is required outside a terminal. |
| `invitations` | | Invitations sent to you, and workspaces you can join through your email domain. |
| `join [workspace]` | `--no-switch` | Accept an invitation (or join through your domain) and switch to it. The slug is optional when there's only one. |
| `decline <workspace>` | | Decline an invitation. |
| `auto-join [add\|remove] [domain]` | | Let anyone with a verified email at a domain join. No arguments lists the domains. Admins. |

### `opendocs invite <emails...>`

Invite people to the active workspace. Same as `team invite`; addresses can also be
comma-separated.

```bash
opendocs invite sam@halvard.example dana@halvard.example --role member --json
```

| Flag | Default | Notes |
| --- | --- | --- |
| `--role <role>` | `member` | `member` or `admin`. |

## Export theme

### `opendocs theme`

The brand color, font, logo and footer of PDF and Word exports in the active
workspace. Reading is open to everyone; changes need Pro or Team and an owner or
admin. Agents ask before changing the theme. With no subcommand, same as
`theme show`. See [Branded PDF and Word exports](../publishing/branded-exports.md).

```bash
opendocs theme --json
opendocs theme presets --json
opendocs theme check "#13294B"
opendocs theme set --preset boardroom --yes --json
opendocs theme set --color "#13294B" --font "IBM Plex Sans" --yes --json
opendocs theme footer --company "Halvard" --tagline "Field research, done carefully" --on --yes --json
opendocs theme logo ./halvard-logo.png --yes --json
```

| Subcommand | Flags | Notes |
| --- | --- | --- |
| `show` | | The current theme, and whether you can change it and its footer. |
| `presets` | | The curated color and font presets. |
| `fonts` | | Fonts available in exports. |
| `check <color>` | | A color's contrast on white, without changing anything. |
| `set` | `--preset <id>`, `--color <hex>`, `--font <name>`, `--logo-in-exports <on\|off>`, `--allow-low-contrast`, `-y`, `--yes` | Change the theme. The brand color must be dark (4.5:1 on white or more), or it's refused with `low_contrast` unless you pass `--allow-low-contrast`. |
| `footer` | `--company <name>`, `--tagline <text>`, `--link-url <url>`, `--link-label <text>`, `--on`, `--off`, `-y`, `--yes` | The footer at the end of every export. Pro and Team; Free exports keep "Made with OpenDocs". `--company` defaults to the workspace name. |
| `logo [file]` | `--remove`, `-y`, `--yes` | Upload the workspace logo (PNG, JPEG or WebP, under 2 MB) or remove it. |

`set`, `footer` and `logo` need `--yes` outside a terminal (`confirm_required`
otherwise).

## Integrations

Google Drive and DocuSeal, on Pro and Team. Owners and admins connect them in the
dashboard; these commands use them. See [Google Drive](../integrations/google-drive.md)
and [E-signatures with DocuSeal](../integrations/docuseal.md).

### `opendocs integrations`

What the active workspace has connected, its named Drive folders, who may use
integrations, and how signature requests are confirmed. Read-only.

```bash
opendocs integrations --json
```

JSON:
`{ workspace, tier, role, canManage, canUse, settings, dashboardUrl, integrations }`,
where `settings` is `{ usableBy, signatureConfirmation }`. Drive folder names are in
`integrations[].destinations[].name`. The full shape is on
[Google Drive](../integrations/google-drive.md#under-the-hood).

### `opendocs save <doc>`

Save a document to a named Google Drive folder. Only when the user asks.

```bash
opendocs save board-minutes.md --folder "Board Minutes" --json
opendocs save halvard-onboarding-guide --folder "HR Policies" --format docx --version 3 --filename "Onboarding guide 2026" --json
```

| Flag | Default | Notes |
| --- | --- | --- |
| `--folder <name>` | Required | A folder name from `opendocs integrations`. |
| `--format <format>` | `pdf` | `pdf`, `docx` or `md`. |
| `--version <n>` | Latest | An earlier version. |
| `--filename <name>` | The document title | File name in Drive; the format's extension is added. |

### `opendocs sign`

E-signatures through the workspace's DocuSeal account. `request` makes a draft and
sends nothing; `send` sends it, only after the user confirmed every signer.

```bash
opendocs sign request consulting-agreement.md --signer "John Adams <adams@company.example>" --json
opendocs sign send <id> --yes --json
opendocs sign status <id> --json
```

| Subcommand | Flags | Notes |
| --- | --- | --- |
| `request <doc>` | `--signer <signer>` (repeat, required), `--parallel`, `--subject <subject>`, `--message <message>`, `--expires <date>`, `--file-to <folder>`, `--version <n>` | Create a draft. `--signer` is `"Name <email>"` or `"Role=Name <email>"`, in signing order, 1 to 10. Sequential unless `--parallel`. `--expires` is `YYYY-MM-DD`. `--file-to` files the signed PDF and audit log in a Drive folder once everyone has signed. |
| `send <id>` | `-y`, `--yes` | Send a draft. `--yes` is required outside a terminal and with `--json` (`confirm_required` otherwise, before any request). In browser-confirmation workspaces: `approval_required` with `approveUrl`. |
| `status <id>` | | Where it stands, refreshed from DocuSeal. |
| `list` (`ls`) | `--doc <doc>`, `--status <status>` | Newest first, up to 50. `--status`: `draft`, `pending`, `completed`, `declined`, `expired`, `cancelled`, `failed`. |
| `cancel <id>` | `-y`, `--yes` | Cancel a draft or pending request. `--yes` is required outside a terminal. |
| `download <id>` | `--kind <kind>` (default `signed`), `--draft`, `--audit`, `-o`, `--output <path>` | `signed`, `audit` (the audit log) or `draft` (the exact PDF signers will get, until it's sent). |
| `save <id>` | `--folder <name>` (required) | Save a completed request's signed PDF and audit log to a Drive folder. |

The full flag reference and JSON are on
[E-signatures with DocuSeal](../integrations/docuseal.md#under-the-hood).

## Agents

### `opendocs agent`

Print the instructions bundled with this CLI version for AI agents, or install them
as a skill. Needs no login and fetches nothing.

```bash
opendocs agent                 # short reference
opendocs agent --full          # the full SKILL.md
opendocs agent --cli           # CLI-only reference
opendocs agent --api           # API-only reference
opendocs agent --install       # every agent found on this machine
opendocs agent --install --agent codex cursor   # just these, even if not found
opendocs agent --install --list                 # supported agents and where they read skills
opendocs agent --install ./.claude/skills/opendocs   # one folder, e.g. in a repository
```

| Flag | Default | Notes |
| --- | --- | --- |
| `--full` | | The full bundled `SKILL.md`. |
| `--cli` | | CLI-only reference. |
| `--api` | | API-only reference. |
| `--install [dir]` | Every detected agent | Write `SKILL.md` and `scripts/opendocs.sh` into each agent's skills folder, or into the folder you name. |
| `--agent <ids...>` | | With `--install`: only these agents, creating their folders if needed. |
| `--list` | | With `--install`: show the supported agents, their folders and whether they're detected, without installing. |

Installing for every agent, `--agent` and `--list` need CLI 0.5.0 or later
(older versions write `~/.claude/skills/opendocs` only). `--install` finds an
agent by its config folder (`~/.codex`, `~/.cursor`…) and
writes the skill where that agent reads it. Agents that read the shared
`~/.agents/skills` folder get one copy there:

| Agent (`--agent` id) | Skills folder |
| --- | --- |
| Claude Code (`claude-code`) | `~/.claude/skills` |
| Cline (`cline`) | `~/.cline/skills` |
| Hermes Agent (`hermes-agent`) | `~/.hermes/skills` |
| Kiro CLI (`kiro-cli`) | `~/.kiro/skills` |
| Codex (`codex`), Cursor (`cursor`), GitHub Copilot (`github-copilot`), Gemini CLI (`gemini-cli`), opencode (`opencode`), OpenClaw (`openclaw`), Windsurf (`windsurf`), Amp (`amp`), Goose (`goose`), Grok (`grok`) | `~/.agents/skills` |

It never deletes anything, leaves identical files alone, and skips skill
folders that are links (such as the ones `npx skills add` makes). Use one of
`--full`, `--cli` and `--api`. With `--json`:
`{ "variant": "concise", "version": "…", "content": "…" }`, or for `--install`
`{ "installed": [{ "agent", "path", "status" }], "skipped": [{ "agent", "reason" }], "version": "…" }`.

## Common errors

| Error | What to do |
| --- | --- |
| `not_logged_in` | No saved login. Run `opendocs login --email <email>`. |
| `auth_expired` | The key was revoked; the CLI removed it. Sign in again. |
| `no_workspace` | The config has no active workspace. Run `opendocs login` again. |
| `document_limit` | The Free plan's 50 documents are used. Upgrade, unpublish old documents, or publish fewer. |
| `doc_too_large` | Split the Markdown file (1 MB limit). |
| `too_many_files` | More than 500 files (10 anonymously). Publish in smaller groups. |
| `too_many_posts` | More than 10 documents in one export. Split it. |
| `version_conflict` | Someone published a newer version. Pull it, or re-run with `--force` only if the user agrees. |
| `confirm_public_required` | Re-run with `--confirm-public`, only after the user said yes to a public link. |
| `confirm_required` | A command that needs confirmation ran without `--yes` outside a terminal. Nothing was done. Ask the user first. |
| `not_a_member` | Not a member of that workspace. Run `opendocs workspace list --json` and pick one. |
| `image_upload_failed` | Fix or remove the local image reference and retry. |
| `rate_limited` | The API asked for a wait longer than 90 seconds, or five retries ran out. Wait for `Retry-After`, then retry. |
| `plan_required` | The feature needs Pro or Team (the export footer, integrations). Word export on Free returns `docx_requires_pro`. |
| `forbidden` | Your role can't do this (changing the theme, or integrations set to admins only). |
| `integration_not_connected` | Google Drive or DocuSeal isn't connected. An owner or admin connects it; `opendocs integrations` has the link. |
| `destination_not_found` | No Drive folder by that name; `destinations` lists them. Never guess one. |
| `approval_required` | The workspace confirms signature requests in the browser. Give the user `approveUrl`. |
| `signer_roles_mismatch` | The signers don't match the document's signature block; `roles` lists the roles. |

All API error codes are in [Error codes](../errors.md).
