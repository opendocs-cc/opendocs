---
title: Updates and versions
description: Update a published document without changing its link. Every update is a new version that records who published it and through which agent, and any version can be restored.
---

# Updates and versions

When a document changes, your agent publishes the new Markdown to the same
document. The link stays the same, so everyone you sent it to sees the latest
version, and every earlier version is kept.

> **Ask your agent**
>
> "I edited the handbook, update it."
>
> "Who changed the pricing spec this week, and what did it say on Monday?"
>
> "Roll the pricing spec back to version 3."

## What happens

- **Same link, new version.** Readers who open the link get the newest version.
  Content that hasn't changed doesn't create a version.
- **Every version is kept,** with when it was published, who published it and
  through which agent, such as Claude Code or Cursor.
- **Rolling back never deletes anything.** Restoring version 3 publishes its content
  again as the newest version, so a rollback can itself be undone.
- **Your team can edit too.** Any active member of the workspace can update a
  document, change its tags or restore a version, not only its author. The history
  shows who made each change. Changing who can see it, moving, sharing,
  unpublishing and deleting are for the author, owners and admins. See
  [Workspaces and teams](../visibility/workspaces-and-team-access.md#who-can-do-what).
- **No silent overwrites.** If a teammate or another agent published a newer
  version since your copy, your agent's update stops and it tells you, instead of
  replacing their work. See [Sync a folder](./sync-and-history.md#conflicts).

## Under the hood

### Two ways to update

**Publish the file again** from the folder that first published it. This is what
your agent normally does:

```bash
opendocs publish handbook.md --json
```

The CLI finds the document in `.opendocs/state.json`, sends the version your copy
is based on, and the API refuses with `version_conflict` if the live document has
moved on. The result lists the file under `updated` with `action`: `updated`,
`unchanged`, `conflict` or `failed`. See [Sync a folder](./sync-and-history.md).

**`opendocs update`** works on any document you can edit, from any folder:

```bash
opendocs update pricing-spec.md --post-id pricing-spec --tags pricing,q4 --json
```

| Flag | Meaning |
| --- | --- |
| `--post-id <id-or-slug>` | Required. The document to update. |
| `--title <title>` | Override the title. |
| `--visibility <level>` | `private`, `workspace` or `public`. Omit to keep the current one. |
| `--confirm-public` | Required when changing to `public`. |
| `--tags <tags>` | Replace the tags with this comma-separated list. Omit to keep them. |
| `--json` | Global. Machine-readable output. |

```json
{
  "postId": "4b1e7c20-8f3a-4d59-b6e2-91c0d7a3f845",
  "versionId": "a9d2e6f1-3c47-4b80-8e15-7f2b9c6d0e34",
  "versionNumber": 4,
  "unchanged": false,
  "slug": "pricing-spec",
  "url": "/halvard/pricing-spec",
  "title": "Pricing spec",
  "visibility": "workspace",
  "tags": ["pricing", "q4"]
}
```

Things to know about `update`:

- It uploads local images the same way `publish` does.
- It doesn't check for conflicts and doesn't update `.opendocs/state.json`. For a
  file this folder tracks, use `publish` instead, or the next `publish` reports a
  conflict with your own update.
- A slug in `--post-id` resolves inside the active workspace and project, so it
  finds a teammate's document as well as your own. Any member of the workspace
  can update a workspace document.
- Unchanged content returns `"unchanged": true` and no new version, but a new title,
  visibility or tag list still applies.
- Changing visibility through `update` needs the same rights as
  `opendocs visibility`: author, owner or admin.
- There's no `--export`. Run `opendocs export <doc> -f pdf` afterwards.
- It only works on published documents. See
  [Unpublish and delete](./list-get-pull-unpublish.md#unpublish-and-delete).

### Version history and rollback

```bash
opendocs history pricing-spec.md                 # every version, newest first
opendocs pull pricing-spec.md --version 3 --stdout
opendocs rollback pricing-spec.md 3              # alias: opendocs restore
```

`<doc>` can be a post ID, a slug, or a local `.md` file this folder published.
`history --json` returns each version as:

```json
{
  "versionNumber": 5,
  "createdAt": "2026-10-21T09:14:03.000Z",
  "createdBy": "dana",
  "client": "claude-code",
  "restoredFromVersion": 3,
  "isCurrent": true
}
```

`client` comes from the `X-OpenDocs-Client` header. The CLI detects Claude Code,
Cursor, Codex, Gemini CLI and OpenCode on its own; other agents set it with the global
`--client <name>` flag or `OPENDOCS_CLIENT`. `restoredFromVersion` is set on
versions made by a rollback. Rollback doesn't touch
your local file: run `opendocs pull pricing-spec.md -o pricing-spec.md` before
editing again.

The endpoints are listed under
[Agent endpoints](../api-reference/agent-endpoints.md#version-history).

## Related pages

- [Sync a folder](./sync-and-history.md)
- [Find, download and remove](./list-get-pull-unpublish.md)
- [How OpenDocs works](../getting-started/how-opendocs-works.md)
