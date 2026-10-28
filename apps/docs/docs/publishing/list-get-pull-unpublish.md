---
title: Find, download and remove documents
description: Ask your agent what's published, get a document's Markdown or a PDF back, change who can see it, take it offline, or delete it for good.
---

# Find, download and remove documents

Once documents are published, your agent can find them, bring their Markdown back
into your folder, export them, change who can see them, and take them down.

> **Ask your agent**
>
> "What have we published in the Investors project?"
>
> "Get me the current Markdown of the onboarding handbook."
>
> "Take down the old pricing page."

## What happens

- **Lists follow your active project.** Your agent lists the project you're working
  in and tells you how many documents the other projects hold. Ask for "everything
  in the workspace" to see them all.
- **Downloads are plain Markdown.** One document, a whole project or the whole
  workspace, written into your folder. To edit and publish back, see
  [Sync a folder](./sync-and-history.md).
- **"Take it down" means unpublish.** Your agent unpublishes unless you clearly ask
  for deletion, and asks before deleting, because deletion can't be undone.

### Unpublish and delete

| | Unpublish | Delete |
| --- | --- | --- |
| The link | Stops working | Stops working |
| On the server | The document and every version are kept | Removed, with every version and tag |
| Who still sees it | Its author and the workspace's owners and admins (lists, `get`, `pull`); everyone else gets not found | Nobody |
| The URL slug | Stays reserved, so nothing else takes it | Freed for reuse |
| A Free plan slot | Freed | Freed |
| Undo | No command brings it back at the same link | None |

To bring it back, publish the file as a new document (`--new` from the folder that
published it). It gets a new link, such as `pricing-2`, because the unpublished
one keeps its slug. Use unpublish when
you want something offline but kept; delete when it should be gone and its URL
free.

Unpublishing and deleting are for the document's author, owners and admins, from
the CLI, the API or the dashboard; see
[Who can do what](../visibility/workspaces-and-team-access.md#who-can-do-what).

## Under the hood

Commands take a document as a post ID or a slug. `pull`, `export`, `history`,
`rollback`, `move` and `share` also accept a local `.md` file this folder
published. A slug resolves inside the active workspace and project, so it finds
teammates' documents as well as your own; a post ID works wherever you can read
the document. What you can then change depends on your role (see
[Who can do what](../visibility/workspaces-and-team-access.md#who-can-do-what)).

### List

```bash
opendocs list                          # active workspace, active project
opendocs list --project investors      # another project
opendocs list --all-projects           # every project in the workspace
opendocs list --all                    # every workspace you belong to
opendocs list --tag board --page 2 --limit 50
opendocs list --json
```

`--page` and `--limit` take positive integers; `--limit` is at most 100. A
project-scoped list ends with a hint such as
`37 more documents in 4 other projects: guides (30), handbook (3), ...`.

The JSON has the page, limit, total and each document's ID, slug, title,
visibility, `isPublished`, version number, project and `workspaceId` /
`workspaceSlug`. `scope` is `"all"` with `--all` and `"workspace"` otherwise;
`projectSlug` is the listed project (`null` with `--all-projects` or `--all`).
Project-scoped lists also carry `otherProjects` as `{ name, slug, postCount }`.
Unpublished documents are listed with `isPublished: false`.

### Get

```bash
opendocs get q3-investor-update --json
```

Shows the URL, post ID, slug, project, visibility, whether it's published, the
version number, when it was updated, and its tags.

### Pull

```bash
opendocs pull q3-investor-update                     # saves q3-investor-update.md
opendocs pull q3-investor-update --stdout
opendocs pull q3-investor-update -o drafts/q3.md
opendocs pull q3-investor-update --version 2 --stdout
opendocs pull --project investors -o ./investors
opendocs pull --workspace -o ./halvard-backup
opendocs pull --workspace --tag board --dry-run
```

| Flag | Meaning |
| --- | --- |
| `-o, --output <path>` | File for one document; folder for bulk pulls. |
| `--stdout` | Print the Markdown. One document only. |
| `--version <n>` | An earlier version. See `opendocs history`. |
| `--project [slug]` | Every document in the active project, or the one named. |
| `--workspace` | Every project in the active workspace. |
| `--tag <tag>` | Only documents with this tag (bulk pulls). |
| `--overwrite` | Replace existing files (bulk pulls). |
| `--dry-run` | Show what would be written, write nothing. |

A workspace pull writes Default-project documents at the output root and other
projects under `projects/<slug>/`. A bulk pull stops before writing if a file
exists, unless you pass `--overwrite`. Unlike `clone`, a pull doesn't link the
files for re-publishing.

If you wrote the document or are a member of its workspace, a pull gets the full
source, [`private` blocks](./rendering-and-metadata.md#private-blocks) included. A
guest it was shared with gets it without them.

### Export

```bash
opendocs export q3-investor-update -f pdf
opendocs export q3-investor-update -f pdf -o exports/
opendocs export intro guide api-spec -f pdf -o ./exports
opendocs export --project investors -f pdf
```

The default format is `pdf`; pass `-f docx` for Word (Pro and Team). Single exports are
saved as `<slug>.pdf` in the current folder unless `-o` names a file or folder;
several documents (up to 10 per command) or a whole `--project` go into a folder.
Filenames from the server are used only as plain names inside that folder. See
[PDF, Word and branding](./branded-exports.md#export-commands) for every flag.

### Change visibility

```bash
opendocs visibility q3-investor-update private
opendocs visibility q3-investor-update workspace
opendocs visibility changelog public --confirm-public
```

Changes who can see a document without creating a version or re-uploading
anything. Going `public` without `--confirm-public` fails with
`confirm_public_required` before any request is sent. See
[Who can see a document](../visibility/overview.md).

### Unpublish

```bash
opendocs unpublish old-pricing
```

Sets the document offline (`isPublished: false`) and keeps the record, its versions
and its slug. `opendocs update` and `opendocs visibility` refuse unpublished
documents, and publishing the tracked file again fails; pass `--new` to publish it
as a new document.

### Delete

```bash
opendocs delete old-pricing --yes
```

Removes the document, every version and its tags in one transaction, and frees the
slug. There's no recycle bin. The deletion is recorded in the workspace's audit
log.

- Outside a terminal (agents, scripts, CI), `--yes` / `-y` is required. Without
  it the CLI exits with `confirm_required` and sends nothing.
- At a terminal without `--yes`, you're asked to type the post ID or slug again.
  Anything else cancels.

### Tips for agents

- Use `list --json` to find the right document, and `get` to check its URL or
  visibility before changing it.
- Use `pull --stdout` to read the current body without writing a file.
- Use `visibility` rather than `update` to change only who can see a document.
- "Remove" or "take down" means `unpublish`. Delete only when asked, with `--yes`.

## Related pages

- [Sync a folder](./sync-and-history.md)
- [Updates and versions](./update-and-version-history.md)
- [Post changes API](../api-reference/post-mutations.md)
