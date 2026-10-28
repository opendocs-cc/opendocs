---
title: Posts endpoints
sidebar_position: 6
description: List documents, read one document's metadata or raw Markdown, and read public documents without a key.
---

# Posts endpoints

Read-side endpoints for documents ("posts" in the API). The signed-in ones
accept an API key or a session and return what you're allowed to read:

- documents you wrote, in any workspace;
- `workspace` and `public` documents in workspaces you're an active member of;
- for single-document reads, also public documents in workspaces that allow
  them and documents shared with your verified email.

## Post IDs and slugs

Every `/posts/:postId` route takes either the post's UUID or its slug. A value
shaped like a UUID (`8d0f3c1e-2b4a-4c6d-9e8f-7a6b5c4d3e2f`) is looked up by id;
anything else is treated as a slug. Slugs are unique per project, not
globally, so scope slug lookups with `?workspaceId=` and, if needed,
`?projectId=`. The CLI sends the active workspace by default. Without
`workspaceId`, a slug resolves only inside your own workspaces and documents,
never another workspace's. If several documents match, yours wins, then the
most recently updated. UUID lookups ignore both parameters but still check
that you can read the document.

## `GET /api/v1/posts`

Lists documents, most recently updated first.

### Query parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `page` | number | No | Defaults to `1` |
| `limit` | number | No | Defaults to `20`, max `100` |
| `tag` | string | No | Only documents with this tag (case-insensitive) |
| `workspaceId` | string | No | Only this workspace. Omit it to list across all your workspaces. |
| `projectId` | string | No | Only this project |

```bash
curl "https://api.opendocs.cc/api/v1/posts?workspaceId=ws_123&tag=investors" \
  -H "Authorization: Bearer od_live_xxxxx"
```

### Response

```json
{
  "posts": [
    {
      "id": "8d0f3c1e-2b4a-4c6d-9e8f-7a6b5c4d3e2f",
      "slug": "q3-investor-update",
      "title": "Q3 investor update",
      "summary": "Revenue grew 18% quarter over quarter.",
      "visibility": "workspace",
      "isPublished": true,
      "updatedAt": "2026-10-12T10:00:00.000Z",
      "workspaceId": "ws_123",
      "workspaceSlug": "halvard",
      "projectId": "proj_456",
      "projectSlug": "investors",
      "projectName": "Investors",
      "isDefaultProject": false,
      "versionNumber": 3,
      "tags": ["investors", "q3"],
      "url": "/halvard/projects/investors/q3-investor-update",
      "publicUrl": "https://opendocs.cc/halvard/projects/investors/q3-investor-update"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

- `visibility` is `private`, `workspace` or `public`.
- `isPublished` is `false` for your own unpublished documents. Teammates'
  documents are listed whether or not they're published, as long as their
  visibility is `workspace` or `public`.
- `versionNumber` is the current version, so you can spot remote changes with
  one request.
- `url` and `publicUrl` are the same as on a single document, below.

## `GET /api/v1/posts/:postId`

Metadata for one document.

| Query | Notes |
| --- | --- |
| `workspaceId` | Scope a slug lookup to this workspace |
| `projectId` | Scope a slug lookup to this project |

```json
{
  "post": {
    "id": "8d0f3c1e-2b4a-4c6d-9e8f-7a6b5c4d3e2f",
    "slug": "q3-investor-update",
    "title": "Q3 investor update",
    "summary": "Revenue grew 18% quarter over quarter.",
    "visibility": "workspace",
    "isPublished": true,
    "publishedAt": "2026-10-01T09:00:00.000Z",
    "updatedAt": "2026-10-12T10:00:00.000Z",
    "url": "/halvard/projects/investors/q3-investor-update",
    "publicUrl": "https://opendocs.cc/halvard/projects/investors/q3-investor-update",
    "projectId": "proj_456",
    "projectSlug": "investors",
    "projectName": "Investors",
    "isDefaultProject": false,
    "versionNumber": 3,
    "versionId": "1e3a5c7f-9b2d-4f6e-8a0c-2d4f6b8e1a3c",
    "versionCreatedAt": "2026-10-12T10:00:00.000Z",
    "tags": ["investors", "q3"]
  }
}
```

`url` is a path: `/<workspace-slug>/<post-slug>` for the Default project,
`/<workspace-slug>/projects/<project-slug>/<post-slug>` otherwise.
`publicUrl` is the full link to share: on the workspace's
[custom domain](/publishing/custom-domains) when the domain is active, on
`https://opendocs.cc` otherwise.

## `GET /api/v1/posts/:postId/raw`

The current Markdown of a document. Same query parameters as above.

```json
{
  "postId": "8d0f3c1e-2b4a-4c6d-9e8f-7a6b5c4d3e2f",
  "markdown": "# Q3 investor update\n\nRevenue grew 18% quarter over quarter.",
  "title": "Q3 investor update",
  "slug": "q3-investor-update",
  "projectId": "proj_456",
  "projectSlug": "investors",
  "projectName": "Investors",
  "isDefaultProject": false,
  "versionNumber": 3
}
```

`opendocs pull` uses this to write the local file. For an older version, see
[version history](/api-reference/agent-endpoints#version-history).

The author and members of the document's workspace get the full source,
fenced `private` blocks included. Anyone else who can read it (a guest it was
shared with, or any signed-in reader of a public document) gets it without
those blocks, like the page.

## Errors

| Status | `error` | When |
| --- | --- | --- |
| `401` | `unauthorized` | Missing or invalid key |
| `404` | `not_found` | No document you can read matches. A teammate's private document and another workspace's documents answer this too. When a slug misses in `workspaceId` but you wrote a document with that slug in another workspace, `message` names that workspace. |
| `429` | `rate_limited` | Over the 600 requests a minute per-IP limit |

## Public documents without a key

Agents and scripts can read a published document the same way a browser
would. These routes need no auth; with a key or session they also serve your
own and your workspaces' non-public documents.

### `GET /api/v1/public/posts/:workspaceSlug/:postSlug/raw`

Also `GET /api/v1/public/posts/:workspaceSlug/projects/:projectSlug/:postSlug/raw`.
Mirrors the document URL: `opendocs.cc/halvard/q3-investor-update` becomes
`/api/v1/public/posts/halvard/q3-investor-update/raw`.

Returns the Markdown as `text/markdown; charset=utf-8` with
`Content-Disposition: attachment; filename="<slug>.md"`. Fenced `private`
blocks are left out, for every reader. Unpublished documents and anything you
can't read return `404 not_found`. Rate limit: 120 requests a minute per IP.

### `GET /api/v1/public/workspaces/:workspaceSlug/markdown.zip`

Every document in the workspace you can read, as a zip of `.md` files (up to
the 200 most recently updated), without their fenced `private` blocks.
Default-project documents sit at the root,
others under `<project-slug>/`, with a `manifest.json`:

```json
{
  "workspace": "halvard",
  "workspaceName": "Halvard",
  "downloadedAt": "2026-10-24T09:00:00.000Z",
  "postCount": 2,
  "posts": [
    { "slug": "q3-investor-update", "title": "Q3 investor update", "updatedAt": "2026-10-12T10:00:00.000Z", "path": "investors/q3-investor-update.md" }
  ]
}
```

| Status | `error` | When |
| --- | --- | --- |
| `404` | `not_found` | No such workspace, or it doesn't allow public documents and you aren't a member |
| `404` | `no_accessible_posts` | Nothing in it you can read |
| `429` | `rate_limited` | More than 3 downloads a minute per IP |

## Related pages

- [Post mutation endpoints](/api-reference/post-mutations): update, unpublish, visibility, tags, delete
- [Agent endpoints](/api-reference/agent-endpoints): versions, moves, sharing
- [Export endpoints](/api-reference/exports): PDF and Word
- [Errors and pagination](/api-reference/errors-and-pagination)
