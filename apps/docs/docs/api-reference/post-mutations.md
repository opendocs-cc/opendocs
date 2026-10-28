---
title: Post mutation endpoints
sidebar_position: 7
description: Update, unpublish, change visibility, patch tags and delete existing documents, and who may do each.
---

# Post mutation endpoints

Six endpoints change a document you've already published. All accept an API
key or a session and fall under the general rate limit (600 requests a minute
per IP). None of them uses a document slot on Free, so they work even when a
workspace is at 50 of 50.

`:postId` is the post's UUID or its slug; scope slugs with `?workspaceId=` and
`?projectId=` (see [Post IDs and slugs](/api-reference/posts#post-ids-and-slugs)).

## Who can do what

| Action | Who | Endpoint |
| --- | --- | --- |
| Publish a new version, retag | The author and any active member of the document's workspace | `update`, `tags` |
| Change visibility or project as part of an update | The author, workspace owners and admins | `update` with `visibility` or `projectId`/`projectSlug` |
| Change visibility, unpublish, delete | The author, workspace owners and admins | `visibility`, `unpublish`, `DELETE` |

These are the same rules the dashboard follows. Anyone else who can read the
document gets `403 forbidden`. A document you can't read, such as a
teammate's private one or another workspace's, answers `404 not_found`.

A slug finds any document you can read in the workspace you scope it to (the
CLI sends its active workspace). Without `workspaceId` it looks only in your
own workspaces, never another one's. A UUID works anywhere you have access.

## `POST /api/v1/posts/:postId/update`

Publishes new content as the next version. The URL doesn't change unless the
update also moves the document to another project.

### Request body

```json
{
  "markdown": "# Q3 investor update\n\nRevenue grew 21% quarter over quarter.",
  "title": "Q3 investor update",
  "workspaceId": "ws_123",
  "tags": ["investors", "q3"],
  "sourcePath": "updates/q3-investor-update.md",
  "baseVersionNumber": 3
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `markdown` | yes | 1 to 1,000,000 characters |
| `workspaceId` | yes | Required by validation; the document's own workspace is always used |
| `title` | no | 1 to 255 characters. Omit it to take the title from the Markdown again |
| `visibility` | no | Omit to keep the current visibility. Changing it needs author, owner or admin |
| `confirmPublic` | no | Must be `true` when `visibility` is `public` |
| `tags` | no | Omit to keep the current tags. `[]` clears them. Up to 20 |
| `projectId` / `projectSlug` | no | Move to this project in the same workspace. Needs author, owner or admin. A taken slug gets a `-2` suffix |
| `sourcePath` | no | Up to 1024 characters |
| `baseVersionNumber` | no | The version your copy came from. If the document has moved past it, nothing is written and you get `409 version_conflict` |

Send `X-OpenDocs-Client` so the version records which agent made it.

### Response

```json
{
  "postId": "8d0f3c1e-2b4a-4c6d-9e8f-7a6b5c4d3e2f",
  "versionId": "3c5e7a9b-1d2f-4a6c-8e0b-2d4f6a8c1e3b",
  "versionNumber": 4,
  "unchanged": false,
  "contentHash": "9a1e...",
  "slug": "q3-investor-update",
  "url": "/halvard/projects/investors/q3-investor-update",
  "publicUrl": "https://opendocs.cc/halvard/projects/investors/q3-investor-update",
  "title": "Q3 investor update",
  "visibility": "workspace",
  "tags": ["investors", "q3"],
  "projectId": "proj_456",
  "projectSlug": "investors",
  "projectName": "Investors",
  "isDefaultProject": false
}
```

When the Markdown is byte-identical to the current version, `unchanged` is
`true`, `versionNumber` stays the same and no version is created. Title,
visibility, tag and project changes still apply.

`publicUrl` is the full link to share, on the workspace's
[custom domain](/publishing/custom-domains) when the domain is active (see [the publish response](/api-reference/publish#response)).

### Errors

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_request` | Body failed validation (missing `markdown` or `workspaceId`, public without `confirmPublic`) |
| `400` | `update_failed` | The document is unpublished ("Cannot update an unpublished post."), or the save failed |
| `403` | `forbidden` | You aren't a member of its workspace, or you tried to change visibility or project without author, owner or admin rights |
| `404` | `not_found` | No document matches, or you can't read it |
| `404` | `project_not_found` | The target project doesn't exist in this workspace |
| `409` | `version_conflict` | `baseVersionNumber` is behind the current version |

```json
{
  "error": "version_conflict",
  "message": "The document is at version 4, but your copy is based on version 3. Pull the latest version and re-apply your changes, or retry with force to overwrite.",
  "currentVersionNumber": 4,
  "baseVersionNumber": 3,
  "currentVersionCreatedAt": "2026-10-14T08:30:00.000Z"
}
```

## `POST /api/v1/posts/:postId/unpublish`

Takes the document offline. Its Markdown and versions are kept and its slot on
Free is freed. The author, workspace owners and admins.

```json
{
  "postId": "8d0f3c1e-2b4a-4c6d-9e8f-7a6b5c4d3e2f",
  "unpublished": true
}
```

| Status | `error` | When |
| --- | --- | --- |
| `400` | `unpublish_failed` | Already unpublished, or the change failed. The message is "Unable to unpublish document." |
| `403` | `forbidden` | You aren't the author, a workspace owner or an admin |
| `404` | `not_found` | No document matches, or you can't read it |

`update` doesn't work on an unpublished document. To bring one back, publish
its Markdown again with [`POST /api/v1/publish`](/api-reference/publish),
which creates a new document and counts against the Free cap.

## `POST /api/v1/posts/:postId/visibility`

Changes visibility without new Markdown. The author, workspace owners and
admins.

```json
{
  "visibility": "public",
  "confirmPublic": true
}
```

`visibility` is `private`, `workspace` or `public`. `confirmPublic: true` is
required for `public`. A public document is visible outside the workspace only
while the workspace allows public documents.

```json
{
  "postId": "8d0f3c1e-2b4a-4c6d-9e8f-7a6b5c4d3e2f",
  "visibility": "public",
  "url": "/halvard/projects/investors/q3-investor-update",
  "publicUrl": "https://notes.halvard.example/projects/investors/q3-investor-update"
}
```

`publicUrl` follows the new visibility: making a document public in a
workspace with an active [custom domain](/publishing/custom-domains) returns the
custom-domain link.

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_visibility` | `visibility` isn't `private`, `workspace` or `public` |
| `400` | `visibility_change_failed` | `public` without `confirmPublic: true` (message "Unable to change document visibility."), or the document is unpublished ("Cannot change visibility of an unpublished post.") |
| `403` | `forbidden` | You aren't the author, a workspace owner or an admin |
| `404` | `not_found` | No document matches, or you can't read it |

## `PATCH /api/v1/posts/:postId/tags`

Adds and removes tags without resending the list. Any active member of the
document's workspace.

```json
{
  "add": ["board"],
  "remove": ["draft"]
}
```

At least one of `add` or `remove` must be non-empty. Each takes up to 20 tags
of 1 to 64 characters; tags are lowercased. A document can have at most 20.

```json
{
  "postId": "8d0f3c1e-2b4a-4c6d-9e8f-7a6b5c4d3e2f",
  "tags": ["board", "investors", "q3"]
}
```

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_request` | Both lists empty, or bad types |
| `400` | `tag_update_failed` | The result would have more than 20 tags |
| `403` | `forbidden` | You aren't a member of the document's workspace |
| `404` | `not_found` | No document matches, or you can't read it |

## `DELETE /api/v1/posts/:postId`

Deletes the document, its versions and tags for good, frees the slug and, if
it was published, its Free slot. The author, workspace owners and admins.
This can't be undone.

```json
{
  "postId": "8d0f3c1e-2b4a-4c6d-9e8f-7a6b5c4d3e2f",
  "deleted": true,
  "slug": "q3-investor-update"
}
```

| Status | `error` | When |
| --- | --- | --- |
| `400` | `delete_failed` | The delete failed. The message is "Unable to delete document." |
| `403` | `forbidden` | You aren't the author, a workspace owner or an admin |
| `404` | `not_found` | No document matches, or you can't read it |

## Related pages

- [Posts endpoints](/api-reference/posts): list, get, raw
- [Agent endpoints](/api-reference/agent-endpoints): version history, restore, move, share
- [Publish endpoints](/api-reference/publish): new documents
- [Errors and pagination](/api-reference/errors-and-pagination)
