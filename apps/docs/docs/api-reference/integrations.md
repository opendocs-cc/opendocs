---
title: Integrations API
description: Save documents to Google Drive and prepare, send, track and file DocuSeal signature requests through the OpenDocs API.
---

# Integrations API

These endpoints save a document to a Google Drive folder and run DocuSeal
signature requests: draft, confirm, send, track, download and file. They back
the CLI's `opendocs integrations`, `opendocs save` and `opendocs sign`
commands. For what the integrations do and how to set them up, see
[Google Drive](/integrations/google-drive) and
[DocuSeal](/integrations/docuseal).

Connecting an integration, naming Drive folders and changing the workspace's
integration settings happen in the dashboard (**Integrations** tab, owners
and admins). There's no API for those.

## Access

All endpoints accept an API key or a session. On top of that:

| Requirement | Otherwise |
| --- | --- |
| The workspace is on Pro or Team | `403 plan_required` (includes `tier`) |
| You're an active member of the workspace | `404 not_found` |
| You may **use** integrations: owners and admins always; members unless the workspace limits integrations to admins | `403 forbidden` with `reason: "integrations_admins_only"` |
| You can read the document (for saving and drafting) | `404 not_found` |

`GET /integrations` only needs the first two, so a member can always see what's
connected (`canUse` tells them whether they may use it).

Signature requests belong to the workspace: anyone who may use integrations
there can list, read, send, cancel and download any of its requests.

Two workspace settings shape this:

| Setting | Values | Effect |
| --- | --- | --- |
| `usableBy` | `members` (default), `admins` | Who may save documents and handle signature requests |
| `signatureConfirmation` | `chat` (default), `browser` | Who may send a draft: an agent after the person says yes in chat, or only a person in the browser |

**Rate limits.** Saving a document, drafting a signature request, downloading
a request's PDFs and filing signed copies count toward the export limit (120 a
minute per account, shared with
[single exports](/api-reference/exports)). The other endpoints fall under the
general limit.

## `GET /api/v1/integrations?workspaceId=...`

What's connected, the Drive folders you can save to, your permissions and the
workspace settings.

```json
{
  "workspace": { "id": "ws_123", "slug": "halvard", "name": "Halvard" },
  "tier": "pro",
  "role": "member",
  "canManage": false,
  "canUse": true,
  "settings": { "usableBy": "members", "signatureConfirmation": "chat" },
  "dashboardUrl": "https://opendocs.cc/dashboard/integrations",
  "integrations": [
    {
      "provider": "google_drive",
      "name": "Google Drive",
      "description": "Save documents as PDF, Word or Markdown into Drive folders you choose, including shared drives. Only when you ask.",
      "capabilities": ["storage"],
      "status": "connected",
      "account": "dana@halvard.example",
      "connectedAt": "2026-10-02T09:12:00.000Z",
      "destinations": [
        { "id": "dst_1", "name": "Board Minutes", "folderName": "Board minutes 2026", "driveName": "Legal", "url": "https://drive.google.com/drive/folders/..." },
        { "id": "dst_2", "name": "Signed Contracts", "folderName": "Contracts", "driveName": "Legal", "url": "https://drive.google.com/drive/folders/..." }
      ]
    },
    {
      "provider": "docuseal",
      "name": "DocuSeal",
      "description": "Send documents for e-signature. Signers get an email from DocuSeal; the signed PDF and its audit log come back here.",
      "capabilities": ["signature"],
      "status": "connected",
      "account": "dana@halvard.example",
      "connectedAt": "2026-10-02T09:20:00.000Z",
      "region": "com"
    }
  ]
}
```

- `status` is `connected`, `not_connected` or `error`. With `error`, an `error`
  string says why (for example, access was revoked) and an owner or admin
  needs to reconnect it at `dashboardUrl`.
- `destinations` (Drive only) are the named folders. Pass a `name` (any case)
  or `id` as `destination` below. `folderName` and `driveName` are the real
  Drive folder and shared drive. Empty until Drive is connected.
- `region` (DocuSeal only) is `com`, `eu` or `custom`, or `null` when not
  connected.
- `canManage` is `true` for owners and admins. `canUse` is whether you may use
  integrations.
- Credentials are never returned.

| Status | `error` | When |
| --- | --- | --- |
| `400` | `missing_workspace_id` | No `workspaceId` |
| `403` | `plan_required` | Free workspace |
| `404` | `not_found` | You aren't a member |

## Save a document to Drive

### `POST /api/v1/posts/:postId/storage`

Renders a document (the current version, or one you name) and uploads it to a
named Drive folder. `:postId` is the post's UUID or slug.

```json
{
  "workspaceId": "ws_123",
  "destination": "Board Minutes",
  "format": "pdf",
  "versionNumber": 4,
  "filename": "Board minutes, October 2026"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `destination` | yes | A destination name (case-insensitive) or id, 1 to 200 characters |
| `format` | no | `pdf` (default), `docx` or `md` |
| `versionNumber` | no | Save this version instead of the current one |
| `filename` | no | 1 to 180 characters. A trailing `.pdf`, `.docx` or `.md` is dropped and the right one added. Defaults to the document title |
| `workspaceId` | no | Scopes a slug lookup. Ignored for UUIDs |

PDF and Word files use the workspace's export theme. Every format leaves out
the document's `private` blocks. Each upload is a new Drive file; nothing is
overwritten.

Status `201`:

```json
{
  "id": "run_7f3a",
  "provider": "google_drive",
  "destination": { "id": "dst_1", "name": "Board Minutes", "url": "https://drive.google.com/drive/folders/..." },
  "document": { "id": "8d0f3c1e-2b4a-4c6d-9e8f-7a6b5c4d3e2f", "slug": "board-minutes-october", "title": "Board minutes, October", "versionNumber": 4 },
  "file": {
    "id": "1AbC...",
    "name": "Board minutes, October 2026.pdf",
    "url": "https://drive.google.com/file/d/1AbC.../view",
    "bytes": 84213,
    "sha256": "4e1f...",
    "driveSha256": "4e1f...",
    "verified": true,
    "format": "pdf"
  }
}
```

`id` is the run recorded in the workspace's integration log. `sha256` is the
hash of the bytes OpenDocs sent; `verified` is `false` only if Drive reported a
different checksum.

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_request` | Missing `destination`, bad `format` |
| `403` | `plan_required`, `forbidden` | See [Access](#access) |
| `404` | `not_found` | No document (or version) you can read |
| `404` | `destination_not_found` | No folder by that name. Includes `destination` and `destinations` (the names you can use) |
| `409` | `integration_not_connected` | Google Drive isn't connected (`provider: "google_drive"`) |
| `409` | `reconnect_required` | Drive access was revoked or expired; an owner or admin must reconnect it |
| `409` | `destination_unavailable` | Drive refused the folder (deleted, or the account lost access). Pick it again in the dashboard |
| `502` | `export_failed` | The converter couldn't render the PDF or Word file |
| `502` | `storage_failed` | The upload failed |
| `504` | `export_timeout` | The converter didn't answer within 55 seconds |

## Signature requests

A signature request goes through these states:

| `status` | Meaning |
| --- | --- |
| `draft` | Created, nothing sent. The exact PDF is stored with its SHA-256 |
| `pending` | Sent to DocuSeal; signers are being emailed in order |
| `completed` | Everyone signed. The signed PDF and audit log are available |
| `declined` | A signer declined |
| `expired` | It passed `expiresAt` |
| `cancelled` | Cancelled in OpenDocs |

While a send is in progress the status is briefly `sending`. If DocuSeal
rejects a send, the request goes back to `draft` with the reason in
`lastError`.

OpenDocs refreshes a pending request from DocuSeal when you read it (at most
every 30 seconds) and when DocuSeal's webhook fires. When a request with
`fileTo` completes, the signed PDF and audit log are saved to that Drive folder
automatically and recorded in `filed`.

### The signature request object

```json
{
  "id": "6b8d0f2a-4c6e-4a8b-9d0f-1a3c5e7b9d2f",
  "workspaceId": "ws_123",
  "status": "draft",
  "provider": "docuseal",
  "document": {
    "postId": "8d0f3c1e-2b4a-4c6d-9e8f-7a6b5c4d3e2f",
    "slug": "engagement-letter-northwind",
    "title": "Engagement letter: Northwind",
    "versionNumber": 2,
    "sha256": "b7c1...",
    "fileName": "Engagement letter Northwind (v2).pdf"
  },
  "signers": [
    { "name": "Dana Reyes", "email": "dana@halvard.example", "role": "Halvard", "order": 1, "status": "draft" },
    { "name": "Priya Nair", "email": "priya@northwind.example", "role": "Client", "order": 2, "status": "draft" }
  ],
  "order": "sequential",
  "message": { "subject": "Engagement letter for your signature" },
  "expiresAt": "2026-11-30T23:59:59.000Z",
  "fileTo": { "id": "dst_2", "name": "Signed Contracts" },
  "confirmation": {
    "mode": "chat",
    "approveUrl": "https://opendocs.cc/dashboard/integrations/signatures/6b8d0f2a-4c6e-4a8b-9d0f-1a3c5e7b9d2f"
  },
  "sentAt": null,
  "confirmedVia": null,
  "completedAt": null,
  "filed": null,
  "lastError": null,
  "createdAt": "2026-10-24T14:02:00.000Z"
}
```

- `signers[].status` is `draft`, `sent`, `awaiting`, `opened`, `completed` or
  `declined`. Signed and declined signers also carry `completedAt` or
  `declineReason`.
- `signers[].order` is 1, 2, 3... for `sequential` requests and 1 for everyone
  in `parallel` ones.
- `confirmation.mode` is the workspace's `signatureConfirmation` setting.
  `approveUrl` is the page where a person can review and send the draft.
- `confirmedVia` is `chat` (sent with an API key) or `browser` (sent from a
  session) once sent.
- `filed` is `{ "destination": { "id", "name" }, "files": [{ "kind", "name", "url", "sha256" }], "at" }`
  after the signed copies were saved to Drive.

### `POST /api/v1/posts/:postId/signature-requests`

Creates a **draft**. Nothing reaches a signer until you
[send it](#post-apiv1signature-requestsidsend).

```json
{
  "workspaceId": "ws_123",
  "signers": [
    { "name": "Dana Reyes", "email": "dana@halvard.example", "role": "Halvard" },
    { "name": "Priya Nair", "email": "priya@northwind.example", "role": "Client" }
  ],
  "order": "sequential",
  "message": { "subject": "Engagement letter for your signature", "body": "Hi Priya, here's the engagement letter we discussed." },
  "expiresAt": "2026-11-30",
  "fileTo": "Signed Contracts",
  "versionNumber": 2
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `signers` | yes | 1 to 10. `name` 1 to 120 characters, `email` a valid address (lowercased), optional `role` up to 60 characters |
| `order` | no | `sequential` (default: one after another, in the order given) or `parallel` |
| `message` | no | Email `subject` (up to 200 characters) and `body` (up to 4,000). Longer is refused with `400 invalid_request` |
| `expiresAt` | no | ISO 8601 date or date-time, at least an hour from now. A date alone means 23:59:59 UTC that day |
| `fileTo` | no | A Drive destination name or id. The signed PDF and audit log are saved there on completion |
| `versionNumber` | no | Sign this version instead of the current one |
| `workspaceId` | no | Scopes a slug lookup. Ignored for UUIDs |

The document is rendered to PDF with the workspace's theme and a signing field
in each signature box:

- If the Markdown has no ` ```signature ` block, one is appended with a box per
  signer. Roles are the ones you gave, or `Signer 1`, `Signer 2`, and so on.
- If it has one, every role in the block needs exactly one signer, matched by
  `role` (case-insensitive) or else by the `name` written in the block.

Status `201`: the signature request object plus `warnings`, a list of
messages for signers whose email domain isn't one of the workspace members'
domains.

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_request` | No signers, more than 10, or a field too long (a `message.body` over 4,000 characters, for example) |
| `400` | `invalid_signers` | A bad email address, or a role that's repeated or uses `;`, `{`, `}` or `=` |
| `400` | `signer_roles_mismatch` | Signers don't match the document's signature block. Includes `roles` |
| `400` | `invalid_expiry` | `expiresAt` isn't a date, or is less than an hour away |
| `403` | `plan_required`, `forbidden` | See [Access](#access) |
| `404` | `not_found` | No document (or version) you can read |
| `404` | `destination_not_found` | `fileTo` doesn't name a Drive folder. Includes `destinations` |
| `409` | `integration_not_connected` | DocuSeal isn't connected (`provider: "docuseal"`) |
| `409` | `reconnect_required` | DocuSeal rejected the stored API key; an owner or admin must reconnect it |
| `502` | `export_failed` | The converter couldn't render the draft PDF |
| `504` | `export_timeout` | The converter didn't answer within 55 seconds |

### `GET /api/v1/signature-requests?workspaceId=...`

The workspace's requests, newest first, up to 50.

| Query | Required | Notes |
| --- | --- | --- |
| `workspaceId` | yes | |
| `post` | no | Only requests for this document (UUID or slug). `postId` works too |
| `status` | no | Only this status |

Returns `{ "requests": [ ... ] }`. Errors: `400 missing_workspace_id`,
`403 plan_required`, `403 forbidden`, `404 not_found` (not a member, or no
document matches `post`).

### `GET /api/v1/signature-requests/:id`

One request, refreshed from DocuSeal if it's pending. Returns the signature
request object. A request you can't use (another workspace, or integrations
limited to admins) returns `404 not_found`; a Free workspace returns
`403 plan_required`.

### `POST /api/v1/signature-requests/:id/send`

Sends a draft to the signers through DocuSeal. The body must be exactly:

```json
{ "confirm": true }
```

Send it only after a person has reviewed the document, version, every signer's
name and email, and the order, and said yes. An agent should read those back
in chat first.

- In a `chat` workspace, an API key or a session may send.
- In a `browser` workspace, only a signed-in person can send. An API key gets
  `403 approval_required` with an `approveUrl` to give the person; they review
  and send it on that page.
- Each draft can be sent once.

Returns the signature request object with `status: "pending"`, `sentAt` and
`confirmedVia`. After sending, OpenDocs keeps only the PDF's hash; DocuSeal
holds the document.

| Status | `error` | When |
| --- | --- | --- |
| `400` | `confirmation_required` | The body isn't `{"confirm": true}` |
| `403` | `approval_required` | Browser-confirm workspace and an API key. Includes `approveUrl` |
| `403` | `plan_required`, `forbidden` | See [Access](#access) |
| `404` | `not_found` | No such request, or not in a workspace you're a member of |
| `409` | `already_sent` | It isn't a draft any more. Includes `status` |
| `409` | `integration_not_connected`, `reconnect_required` | DocuSeal isn't connected, or its key stopped working |
| `502` | `send_failed` | DocuSeal didn't accept it (the request stays a draft, with `lastError`), or the draft's PDF is missing |

### `DELETE /api/v1/signature-requests/:id`

Cancels a request. A pending one is archived in DocuSeal, so signers can no
longer sign; a draft is discarded. Cancelling an already cancelled request
returns it unchanged. Returns the signature request object with
`status: "cancelled"`.

| Status | `error` | When |
| --- | --- | --- |
| `403` | `plan_required`, `forbidden` | See [Access](#access) |
| `404` | `not_found` | No such request, or you aren't a member |
| `409` | `already_completed` | Everyone already signed |
| `502` | `cancel_failed` | DocuSeal didn't cancel it |

### `GET /api/v1/signature-requests/:id/documents/:kind`

Downloads a PDF. `:kind` is:

- `draft`: the exact PDF the draft will send (its SHA-256 is
  `document.sha256`). Available until the request is sent.
- `signed`: the signed PDF. Needs `status: "completed"`.
- `audit`: DocuSeal's audit log (certificate of signature). Needs
  `status: "completed"`.

The response is `application/pdf` with `Cache-Control: private, no-store` and a
`Content-Disposition` filename such as
`Engagement letter Northwind (v2) – signed.pdf` (also given as RFC 5987
`filename*`).

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_kind` | `:kind` isn't `draft`, `signed` or `audit` |
| `403` | `plan_required`, `forbidden` | See [Access](#access) |
| `404` | `not_found` | No such request, or you aren't a member |
| `404` | `not_available` | The draft PDF is gone (already sent), or DocuSeal doesn't have the file yet |
| `409` | `not_completed` | `signed` or `audit` before everyone signed. Includes `status` |
| `409` | `integration_not_connected` | DocuSeal was disconnected |
| `502` | `provider_failed` | DocuSeal didn't respond as expected |

### `POST /api/v1/signature-requests/:id/storage`

Saves the signed PDF and the audit log of a completed request to a Drive
folder as two new files, and marks them read-only in Drive (`locked` is
`false` if Drive didn't allow it). Use it when the request had no `fileTo`, or
to file another copy.

```json
{ "destination": "Signed Contracts" }
```

Status `201`:

```json
{
  "destination": { "id": "dst_2", "name": "Signed Contracts" },
  "files": [
    { "kind": "signed", "id": "1XyZ...", "name": "Engagement letter Northwind (v2) – signed.pdf", "url": "https://drive.google.com/file/d/1XyZ.../view", "bytes": 120934, "sha256": "c0d2...", "driveSha256": "c0d2...", "verified": true, "locked": true },
    { "kind": "audit", "id": "1QrS...", "name": "Engagement letter Northwind (v2) – audit log.pdf", "url": "https://drive.google.com/file/d/1QrS.../view", "bytes": 40211, "sha256": "9e4b...", "driveSha256": "9e4b...", "verified": true, "locked": true }
  ]
}
```

Errors: `not_completed` (409), `destination_not_found` (404),
`integration_not_connected`, `reconnect_required` and
`destination_unavailable` (409), `not_available` (404), `provider_failed` and
`storage_failed` (502), plus the [access](#access) errors.

## DocuSeal webhook

`POST /api/v1/integrations/docuseal/webhook/:integrationId?token=<token>`

Not for API clients: DocuSeal calls it when a submission changes. The URL,
with its token, is shown in the dashboard when you connect DocuSeal, and you
paste it into DocuSeal's webhook settings. If you also save DocuSeal's signing
secret, the `X-DocuSeal-Signature` header is verified too.

A webhook never changes a request by itself; it only makes OpenDocs refresh
the request from DocuSeal's API. Responses: `200 { "ok": true, "synced": "<request id or null>" }`,
`401 unauthorized` (wrong token or signature), `404 not_found` (unknown
integration), `400 invalid_payload`. Bodies are limited to 1 MB.

## Other errors

| Status | `error` | When |
| --- | --- | --- |
| `503` | `integrations_not_configured` | The server has no integrations encryption key (self-hosted setups) |

Every error has the usual `error`, `message` and `docs_url` fields; the
message says what to do next and, when a person has to act, links to the
dashboard. See [Error codes](/errors).

## Related pages

- [Google Drive](/integrations/google-drive) and [DocuSeal](/integrations/docuseal): what they do and how to connect them
- [Export endpoints](/api-reference/exports): PDF and Word downloads
- [Plans and limits](/getting-started/plans-and-limits): integrations are on Pro and Team
