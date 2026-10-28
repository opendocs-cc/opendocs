---
title: Publish endpoints
sidebar_position: 5
description: Publish one Markdown document, or a batch of up to 25, and get stable URLs back.
---

# Publish endpoints

- `POST /api/v1/publish` publishes **one** document.
- `POST /api/v1/publish/batch` publishes **up to 25** in one call, with
  optional live progress over Server-Sent Events.

Both always create new documents. To change an existing one, use
[`POST /posts/:postId/update`](/api-reference/post-mutations). Both return
`403 document_limit` when the workspace is at its plan's cap (50 published
documents on Free, unlimited on Pro and Team); see
[Plans and limits](/getting-started/plans-and-limits#the-50-document-cap-on-free).

---

## `POST /api/v1/publish`

### Auth

API key or session. You must be an active member of `workspaceId`.

### Rate limit

120 requests per minute per account.

### Request body

```json
{
  "markdown": "# Q3 investor update\n\nRevenue grew 18% quarter over quarter.",
  "title": "Q3 investor update",
  "slug": "q3-investor-update",
  "visibility": "workspace",
  "workspaceId": "ws_123",
  "projectSlug": "investors",
  "tags": ["investors", "q3"],
  "sourcePath": "updates/q3-investor-update.md",
  "confirmPublic": false
}
```

### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `markdown` | string | Yes | 1 to 1,000,000 characters. The request body as a whole is capped at 2 MB. |
| `title` | string | No | 1 to 255 characters. Defaults to the frontmatter `title`, else the first `# ` heading, else "Untitled document". |
| `slug` | string | No | Up to 160 characters, slugified. Defaults to one made from the title. A taken slug gets a `-2`-style suffix. `tag`, `tags`, `project` and `projects` are reserved and return `reserved_slug`. |
| `visibility` | string | No | `private`, `workspace` (default) or `public`. |
| `workspaceId` | string | Yes | A workspace you're an active member of. |
| `projectId` | string | No | Project to publish into. Omit both project fields for the Default project. |
| `projectSlug` | string | No | Alternative to `projectId`, resolved inside `workspaceId`. Up to 64 characters. |
| `tags` | string[] | No | Up to 20 tags, 1 to 64 characters each, lowercased and de-duplicated. |
| `sourcePath` | string | No | Up to 1024 characters. The local file path, stored on the version. |
| `confirmPublic` | boolean | No | Must be `true` when `visibility` is `public`. |

Send `X-OpenDocs-Client` to record which agent published the version (see
[Authentication](/api-reference/authentication#recommended-headers)).

### Example

```bash
curl https://api.opendocs.cc/api/v1/publish \
  -X POST \
  -H "Authorization: Bearer od_live_xxxxx" \
  -H "Content-Type: application/json" \
  -H "X-OpenDocs-Client: claude-code" \
  -d '{
    "markdown": "# Q3 investor update\n\nRevenue grew 18% quarter over quarter.",
    "workspaceId": "ws_123",
    "projectSlug": "investors",
    "tags": ["investors", "q3"]
  }'
```

### Response

Status `201`.

```json
{
  "postId": "8d0f3c1e-2b4a-4c6d-9e8f-7a6b5c4d3e2f",
  "slug": "q3-investor-update",
  "url": "/halvard/projects/investors/q3-investor-update",
  "publicUrl": "https://opendocs.cc/halvard/projects/investors/q3-investor-update",
  "title": "Q3 investor update",
  "tags": ["investors", "q3"],
  "versionId": "1e3a5c7f-9b2d-4f6e-8a0c-2d4f6b8e1a3c",
  "versionNumber": 1,
  "contentHash": "5f2c...",
  "projectId": "proj_456",
  "projectSlug": "investors",
  "projectName": "Investors",
  "isDefaultProject": false
}
```

`url` is a path. Default-project documents live at
`/<workspace-slug>/<post-slug>`; other projects at
`/<workspace-slug>/projects/<project-slug>/<post-slug>`. The URL stays the
same when you update the document.

`publicUrl` is the full link to share. It's the workspace's
[custom domain](/publishing/custom-domains) when the domain is active (any
visibility; readers of documents that aren't public sign in there) (for example `https://notes.halvard.example/projects/investors/q3-investor-update`),
and `https://opendocs.cc` plus `url` otherwise. Use `publicUrl` when you print
a link or link one document from another; `url` is kept for older clients.

### Public documents

`visibility: "public"` without `confirmPublic: true` fails validation:

```json
{
  "error": "invalid_request",
  "message": "confirmPublic: Public publishing requires explicit confirmation.",
  "docs_url": "https://docs.opendocs.cc/errors#invalid-request"
}
```

A public document is visible to people outside the workspace only while the
workspace's **Allow public documents** setting is on; otherwise it behaves
like a `workspace` document.

### Errors

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_request` | Body failed validation: missing `markdown` or `workspaceId`, bad `visibility`, public without `confirmPublic`, too many tags |
| `400` | `reserved_slug` | The `slug` you passed is reserved (`tag`, `tags`, `project`, `projects`) |
| `400` | `publish_failed` | You aren't a member of `workspaceId`, the project doesn't exist, or the save failed. The message is "Unable to publish document." |
| `401` | `unauthorized` | Missing or invalid key |
| `403` | `document_limit` | The workspace is at its plan's document cap (body below) |
| `413` | `payload_too_large` | The body is over 2 MB |
| `429` | `rate_limited` | More than 120 publishes a minute. Wait `Retry-After` seconds |

```json
{
  "error": "document_limit",
  "plan": "free",
  "limit": 50,
  "used": 50,
  "message": "Your free plan allows 50 published documents. You currently have 50.",
  "docs_url": "https://docs.opendocs.cc/errors#document-limit"
}
```

---

## `POST /api/v1/publish/batch`

Publishes up to **25** documents. The `Accept` header picks the response:

- `application/json` (default): `207 Multi-Status` with a result per document.
- `text/event-stream`: one Server-Sent Event per document as it finishes.

### Auth

API key or session.

### Rate limit

20 requests per minute per account. At 25 documents each, that's up to 500
documents a minute.

### Limits

- 1 to 25 documents per request.
- Request body up to 32 MB.
- Documents are published one after another, in order. A failed document is
  retried once after 100 ms (except `reserved_slug` and `document_limit`).

### Request body

```json
{
  "documents": [
    {
      "title": "Board minutes, October",
      "markdown": "# Board minutes, October\n\nDecisions...",
      "workspaceId": "ws_123",
      "projectSlug": "board",
      "tags": ["board"]
    },
    {
      "title": "Hiring plan 2027",
      "markdown": "# Hiring plan 2027\n\nRoles...",
      "workspaceId": "ws_123"
    }
  ]
}
```

Each element has the same shape and rules as the `POST /api/v1/publish` body.

### Document-limit pre-check

Before anything is written, the server counts the batch's documents per
workspace and checks each workspace's cap. If any workspace would go over, the
whole batch is rejected with `403` and nothing is published:

```json
{
  "error": "document_limit",
  "plan": "free",
  "limit": 50,
  "used": 48,
  "requested": 3,
  "workspaceId": "ws_123",
  "message": "This batch would publish 3 documents, but your free plan allows 50 total. You have 2 slots left."
}
```

### JSON response

Status `207`.

```json
{
  "results": [
    {
      "success": true,
      "index": 0,
      "postId": "8d0f3c1e-2b4a-4c6d-9e8f-7a6b5c4d3e2f",
      "slug": "board-minutes-october",
      "url": "/halvard/projects/board/board-minutes-october",
      "publicUrl": "https://opendocs.cc/halvard/projects/board/board-minutes-october",
      "title": "Board minutes, October",
      "tags": ["board"],
      "versionId": "1e3a5c7f-9b2d-4f6e-8a0c-2d4f6b8e1a3c",
      "versionNumber": 1,
      "contentHash": "5f2c...",
      "projectId": "proj_789",
      "projectSlug": "board",
      "projectName": "Board",
      "isDefaultProject": false
    },
    {
      "success": false,
      "index": 1,
      "error": "publish_failed",
      "message": "Unable to publish document."
    }
  ],
  "summary": { "total": 2, "succeeded": 1, "failed": 1 }
}
```

Every result carries the input `index`, so you can match failures to your
documents. Successful results have `url` and `publicUrl`, as in the single
publish response. A per-document failure is `publish_failed` or `reserved_slug`; it
doesn't change the `207` status.

### SSE response

```bash
curl -N https://api.opendocs.cc/api/v1/publish/batch \
  -X POST \
  -H "Authorization: Bearer od_live_xxxxx" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d @batch.json
```

```text
event: result
data: {"success":true,"index":0,"postId":"8d0f3c1e-...","slug":"board-minutes-october","url":"/halvard/projects/board/board-minutes-october","publicUrl":"https://opendocs.cc/halvard/projects/board/board-minutes-october", ...}

event: result
data: {"success":false,"index":1,"error":"publish_failed","message":"Unable to publish document."}

event: summary
data: {"total":2,"succeeded":1,"failed":1}
```

- One `result` event per document, sent as soon as it finishes.
- One `summary` event at the end.
- The response sets `Cache-Control: no-cache` and `X-Accel-Buffering: no` so
  proxies don't buffer it.
- Validation and the document-limit check happen before the stream starts, so
  those errors still arrive as normal JSON responses.

### Errors

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_request` | `documents` empty, more than 25 entries, or any entry fails validation (`message` names it, for example `documents.3.markdown`) |
| `401` | `unauthorized` | Missing or invalid key |
| `403` | `document_limit` | The pre-check found a workspace that would go over its cap |
| `413` | `payload_too_large` | The body is over 32 MB. Split the batch into smaller requests |
| `429` | `rate_limited` | More than 20 batches a minute. Wait `Retry-After` seconds |

## Related pages

- [GET /api/v1/me](/api-reference/me): `quota.documents` for a pre-check
- [Post mutation endpoints](/api-reference/post-mutations): update an existing document
- [Errors and pagination](/api-reference/errors-and-pagination): error format and rate limits
- [Plans and limits](/getting-started/plans-and-limits): the document cap
