---
title: Export endpoints
sidebar_position: 8
description: Render documents to PDF or Word one at a time or as a batch zip, plus the public download and free converter routes.
---

# Export endpoints

Render documents to **PDF** or **Word (.docx)** with the workspace's export
theme. PDF works on every plan, with the workspace's logo, brand color and font.
Word export and a custom footer need the workspace to be on Pro or Team; on Free,
exports end with a "Made with OpenDocs" footer and a `branding` object in the
request is ignored. That holds even when a workspace that moved back to Free
still has its own footer saved from its paid plan; the footer is kept and
applies again after an upgrade.

Fenced `private` blocks are never part of an export.

Both signed-in endpoints accept an API key or a session.

## `POST /api/v1/posts/:postId/export/:format`

Exports one document.

- `:postId` is the post's UUID or slug. Scope a slug with `?workspaceId=` and
  `?projectId=`.
- `:format` is `pdf` or `docx`. Anything else returns `404 not_found`.
- You can export any document you can read (see
  [Posts endpoints](/api-reference/posts)).
- Rate limit: 120 a minute per account, and at most 4 exports running at once
  per account.

### Request body

Every field is optional. An empty body exports with the workspace's theme.

```json
{
  "filename": "q3-investor-update",
  "landscape": false,
  "accent_color": "#0B3D5C",
  "branding": { "main_font": "Inter" }
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `filename` | string | 1 to 120 characters, without the extension. Defaults to the slug. |
| `landscape` | boolean | Landscape pages. Default `false`. |
| `accent_color` | string | 6-digit hex, `#` optional. Overrides the brand color for this export. |
| `branding` | object | Converter branding overrides, passed through. Pro and Team only (it can replace the footer); ignored on Free. |

The workspace's theme applies first and the request body on top. Change the
theme itself with
[`PATCH /api/v1/workspace/branding`](/api-reference/agent-endpoints#export-theme)
(API keys) or the dashboard's per-field routes:
[brand color](/api-reference/workspaces#post-apiv1workspacebrand-color),
[font](/api-reference/workspaces#post-apiv1workspaceexport-font) and
[footer](/api-reference/workspaces#post-apiv1workspaceexport-footer).

### Response

The file, with these headers:

```http
Content-Type: application/pdf
Content-Disposition: attachment; filename="q3-investor-update.pdf"
X-Cache: HIT
```

Word files use
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
`X-Cache` (`HIT` or `MISS`) is present only when the server's export cache is
on.

### Errors

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_request` | Body failed validation, for example a bad `accent_color` |
| `403` | `docx_requires_pro` | Word export in a Free workspace |
| `404` | `not_found` | No document you can read matches, or `:format` isn't `pdf` or `docx` |
| `429` | `rate_limited` | Over 120 a minute, or 4 exports already running. Wait `Retry-After` seconds (2 for the concurrency limit) |
| `502` | `export_failed` | The converter returned an error |
| `504` | `export_timeout` | The converter didn't answer within 55 seconds |

## `POST /api/v1/posts/batch/export`

Exports up to **10** documents in one request and returns a zip with every
file that succeeded plus a `manifest.json` describing every entry.

- 1 to 10 `postIds`, UUIDs or slugs, mixed freely.
- Each entry resolves like the single-document route: any document you can
  read, including teammates' workspace documents. Slugs are scoped by
  `workspaceId` and `projectId`, or without them to your own workspaces.
- Rate limit: 30 a minute per account (300 documents), sharing the 4
  concurrent exports with the single-export route.
- Documents are converted one after another. If the client disconnects, the
  server stops.

### Request body

```json
{
  "postIds": ["q3-investor-update", "8d0f3c1e-2b4a-4c6d-9e8f-7a6b5c4d3e2f", "board-minutes-october"],
  "format": "pdf",
  "landscape": false,
  "workspaceId": "ws_123"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `postIds` | yes | 1 to 10 UUIDs or slugs |
| `format` | yes | `pdf` or `docx` |
| `landscape` | no | Applies to every document |
| `accent_color` | no | Applies to every document |
| `branding` | no | Applies to every document. Pro and Team only |
| `workspaceId` | no | Scope slugs to this workspace. Ignored for UUIDs |
| `projectId` | no | Scope slugs to this project |

### Response

Status `200`, even when some documents failed:

```http
Content-Type: application/zip
Content-Disposition: attachment; filename="opendocs-export-2026-10-24.zip"
X-Batch-Manifest: eyJmb3JtYXQiOiJwZGYiLCJyZXN1bHRzIjpbey...=
```

```text
opendocs-export-2026-10-24.zip
├── manifest.json
├── q3-investor-update.pdf
└── board-minutes-october.pdf
```

`manifest.json`:

```json
{
  "format": "pdf",
  "results": [
    {
      "postId": "8d0f3c1e-2b4a-4c6d-9e8f-7a6b5c4d3e2f",
      "success": true,
      "slug": "q3-investor-update",
      "filename": "q3-investor-update.pdf",
      "bytes": 84213,
      "cached": false
    },
    {
      "postId": "rollout-plan",
      "success": false,
      "error": "not_found",
      "message": "Document not found, or you can't read it."
    }
  ],
  "summary": {
    "total": 3,
    "succeeded": 2,
    "failed": 1,
    "cacheHits": 1,
    "cacheMisses": 1
  }
}
```

- A successful result's `postId` is always the UUID; a failed lookup echoes
  what you sent.
- `cached` is `true` when the file came from the export cache.
- `cacheHits` and `cacheMisses` appear only when the export cache is on.
- `X-Batch-Manifest` is the same JSON, base64-encoded, so you can read results
  before opening the zip.

Per-document errors in the manifest:

| `error` | Meaning |
| --- | --- |
| `not_found` | No document you can read matches |
| `docx_requires_pro` | Word export from a Free workspace |
| `converter_failed` | The converter returned an error |
| `converter_timeout` | The converter didn't answer in time |
| `export_failed` | Any other failure |

### Errors

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_request` | More than 10 `postIds`, a bad `format`, a bad `accent_color` |
| `429` | `rate_limited` | Over 30 a minute, or 4 exports already running. Wait `Retry-After` seconds |

## Caching

Exports are cached by content: the Markdown, workspace, format, orientation
and resolved branding. The same inputs return the same bytes without running
the converter again. Cache writes happen after the response and never fail an
export.

## Public download: `POST /api/v1/public/posts/:workspaceSlug/:postSlug/export/:format`

Also `/api/v1/public/posts/:workspaceSlug/projects/:projectSlug/:postSlug/export/:format`.
The "Download PDF / Word" buttons on a document page. No auth needed: anyone
who can open the page can download it. With a key or session, your own and
your workspaces' non-public documents work too.

- Ignores the request body; the workspace's theme always applies.
- Word needs the workspace owner on Pro or Team (`403 docx_requires_pro`).
- Unpublished documents and anything you can't read return `404 not_found`.
- Rate limit: 60 a minute per IP.
- Same `502 export_failed` and `504 export_timeout` errors as above.

## Free converter: `POST /api/v1/tools/convert/pdf` and `/docx`

The no-account converter behind opendocs.cc/tools. Multipart form with a
`file` field (a `.md` or `.markdown` file, up to 2 MB; the tool pages send
pasted text the same way). The output always uses the OpenDocs theme and the
"Made with OpenDocs" footer; an optional `tool` field (the tool page's slug)
tags the footer link.

| Status | `error` | When |
| --- | --- | --- |
| `400` | `missing_file` | No `file` field |
| `400` | `empty_file` | The file is blank or only whitespace |
| `400` | `unsupported_mime` | The file isn't `.md` or `.markdown` |
| `413` | `file_too_large` | The file is over 2 MB |
| `429` | `rate_limited` | More than 5 a minute, 30 an hour or 100 a day per IP |
| `502` | `conversion_failed` | The converter couldn't convert the file |
| `503` | `service_busy` | More than 30 conversions a minute or 600 an hour across everyone; wait `Retry-After` seconds |

## Rate limits

| Endpoint | Limit |
| --- | --- |
| `POST /posts/:postId/export/:format` | 120 a minute per account (shared with the integration routes that render files) |
| `POST /posts/batch/export` | 30 a minute per account |
| Both | 4 exports running at once per account |
| Public download | 60 a minute per IP |
| Free converter | 5 a minute, 30 an hour and 100 a day per IP; 30 a minute and 600 an hour across everyone |

See [Errors and pagination](/api-reference/errors-and-pagination#rate-limits)
for every bucket.

## Related pages

- [Posts endpoints](/api-reference/posts): list, get, raw
- [Agent endpoints](/api-reference/agent-endpoints#export-theme): read and change the export theme
- [Integrations](/api-reference/integrations): save a PDF, Word or Markdown file to Google Drive
- [Workspaces API](/api-reference/workspaces): per-field branding routes
