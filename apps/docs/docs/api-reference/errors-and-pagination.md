---
title: Errors and pagination
sidebar_position: 12
description: The OpenDocs API error shape, status codes by area, every rate limit, and pagination.
---

# Errors and pagination

## Error shape

Every JSON error has the same base shape:

```json
{
  "error": "invalid_request",
  "message": "confirmPublic: Public publishing requires explicit confirmation.",
  "docs_url": "https://docs.opendocs.cc/errors#invalid-request"
}
```

- `error` is a stable code to branch on.
- `message` says what to do next. Routes that don't write one get a default
  (the code in words), so it's never empty.
- `docs_url` links to the code on the [error code reference](/errors). The
  anchor is the code with `_` replaced by `-`.

Some errors add fields:

| Code | Extra fields |
| --- | --- |
| `invalid_request` | `issues`: Zod's flattened `formErrors` and `fieldErrors`. `message` summarizes the first three issues |
| `document_limit` | `plan`, `limit`, `used`; batch adds `requested`, `workspaceId` |
| `version_conflict` | `currentVersionNumber`, `baseVersionNumber`, `currentVersionCreatedAt` |
| `plan_required` | `tier` |
| `plan_limit`, `member_limit` | `plan`, `limit` |
| `low_contrast` | `contrast`, `minContrast` |
| `invalid_preset` / `invalid_font` (branding) | `presets` / `fonts` |
| `domain_mismatch` | `domain`, `yourDomain` |
| `destination_not_found` | `destination`, `destinations` |
| `approval_required` | `approveUrl` |
| `signer_roles_mismatch` | `roles` |
| `already_sent`, `not_completed` | `status` |
| `project_not_empty` | `postCount` |

Account deletion's `409` is the exception: its body has `code` instead of
`error` (see [Account API](/api-reference/account)).

## Status codes by area

The full list with fixes is on [Error codes](/errors).

| Status | Error codes | Where |
| --- | --- | --- |
| `400` | `invalid_request` | Any route that validates its body or query, and any body that isn't valid JSON |
| `400` | `publish_failed`, `reserved_slug` | `POST /publish`, `POST /publish/batch` (per document) |
| `400` | `update_failed`, `unpublish_failed`, `visibility_change_failed`, `invalid_visibility`, `tag_update_failed`, `delete_failed`, `move_failed`, `restore_failed`, `share_failed`, `unshare_failed` | Post mutation routes |
| `400` | `missing_workspace_id` | Routes that take `?workspaceId=` (team lists, branding, auto-join, integrations, signature requests) and the logo upload form |
| `400` | `onboarding_failed`, `invalid_username`, `reserved_username`, `no_username` | Onboarding and username rename |
| `400` | `invalid_code`, `code_expired` | `POST /auth/code/verify` |
| `400` | `invalid_slug`, `default_project`, `project_not_empty`, `confirmation_mismatch` | Workspaces and projects |
| `400` | `invite_limit`, `invalid_domain`, `consumer_domain` | Team and auto-join |
| `400` | `invalid_color`, `low_contrast`, `invalid_preset`, `invalid_font`, `invalid_footer`, `nothing_to_change`, `invalid_input` | Branding |
| `400` | `missing_file`, `empty_file`, `unsupported_mime` | Uploads and the free converter |
| `400` | `confirmation_required`, `invalid_signers`, `signer_roles_mismatch`, `invalid_expiry`, `invalid_kind`, `invalid_payload` | Signature requests |
| `401` | `unauthorized` | Every protected route; the DocuSeal webhook |
| `402` | `billing_failed` | Joining a Team workspace when the seat count couldn't be updated |
| `403` | `forbidden` | Not a member, or your role can't do this |
| `403` | `document_limit` | Publishing or claiming past the Free cap |
| `403` | `plan_limit`, `member_limit` | Creating a workspace, inviting or joining past the plan's cap |
| `403` | `plan_required`, `docx_requires_pro` | Pro features on a Free workspace |
| `403` | `signups_disabled`, `email_not_verified`, `domain_mismatch`, `invalid_claim_token`, `approval_required` | See [Error codes](/errors) |
| `403` | `hidden` | Updating or claiming an anonymous document that readers reported, while it's under review |
| `404` | `not_found`, `project_not_found`, `version_not_found`, `no_accessible_posts`, `destination_not_found`, `not_available` | Lookups. Many routes answer `404` instead of `403` so they don't reveal what exists |
| `409` | `version_conflict` | `POST /posts/:postId/update` with a stale `baseVersionNumber` |
| `409` | `slug_taken`, `last_workspace`, `already_member`, `already_invited`, `owner_cannot_leave`, `username_taken`, `onboarding_incomplete` | Workspaces, team, accounts |
| `409` | `integration_not_connected`, `reconnect_required`, `destination_unavailable`, `already_sent`, `already_completed`, `not_completed` | Integrations |
| `409` | `code: active_plan`, `code: team_workspace_with_members` | `DELETE /account` |
| `410` | `expired` | Anonymous documents and invitations past their expiry |
| `413` | `payload_too_large` | Request bodies over 2 MB, or 32 MB for `POST /publish/batch` |
| `413` | `file_too_large` | Avatar, logo and free-converter uploads over 2 MB |
| `429` | `rate_limited`, `too_many_attempts` | Rate limits; five wrong sign-in codes |
| `500` | `internal_error` | Unexpected errors |
| `502` | `export_failed`, `conversion_failed`, `storage_failed`, `send_failed`, `cancel_failed`, `provider_failed` | The converter, Google Drive or DocuSeal failed |
| `503` | `service_busy` | The free converter or anonymous publishing is at its limit across all clients; wait `Retry-After` seconds |
| `503` | `storage_not_configured`, `integrations_not_configured` | The server is missing configuration |
| `504` | `export_timeout` | The converter didn't answer within 55 seconds |

The converter errors (`502 export_failed`, `504 export_timeout`) are the same
for exports, Drive saves and signature drafts.

## The `document_limit` error

Returned with `403` when a publish would take a workspace past its plan's
document cap (Free: 50 published documents per workspace):

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

The batch version (`POST /publish/batch`) adds `requested` and `workspaceId`:

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

The batch check runs before anything is written: if the cap would be
exceeded, no document in the batch is published. Show `message` to the
person as is. See
[Plans and limits](/getting-started/plans-and-limits#the-50-document-cap-on-free).

## Rate limits

Signed-in routes count per account, so teammates behind one office address
don't share a bucket. Unauthenticated routes count per IP. Every request also
counts toward the per-IP general limit. The signed-in limits are sized so an
agent can republish and re-export a folder of 50+ long documents in one run.

| Route group | Limit | Counted per |
| --- | --- | --- |
| All API traffic | 600 requests a minute | IP |
| `POST /publish` | 120 a minute | Account |
| `POST /publish/batch` (up to 25 documents each) | 20 a minute | Account |
| `POST /posts/:postId/export/:format`, plus the integration routes that render or fetch files (Drive saves, signature drafts, signature PDF downloads, filing signed copies) | 120 a minute, shared | Account |
| `POST /posts/batch/export` (up to 10 documents each) | 30 a minute | Account |
| Exports running at the same time (single and batch) | 4 | Account |
| `POST /auth/code/request` | 5 every 15 minutes | IP |
| `POST /auth/code/verify` | 20 every 15 minutes | IP |
| `POST /anonymous/publish` and `PUT /anonymous/:id` | 20 an hour, shared | IP |
| `POST /anonymous/publish` (new documents) | 50 a day | IP |
| `POST /anonymous/:id/report` | 5 an hour and 20 a day | IP |
| Public download (`POST /public/posts/.../export/:format`) | 60 a minute | IP |
| Public raw Markdown (`GET /public/posts/.../raw`) | 120 a minute | IP |
| Public workspace zip (`GET /public/workspaces/:slug/markdown.zip`) | 3 a minute | IP |
| Free converter (`POST /tools/convert/pdf\|docx`) | 5 a minute, 30 an hour and 100 a day | IP |
| Browser sign-in (`POST /api/auth/*`, used by the dashboard) | 100 every 15 minutes | IP |

Per-IP limits count an IPv6 client by its /56 prefix.

The free converter and anonymous publishing also have ceilings across all
clients, so a flood from many addresses can't crowd out everyone else: 30
conversions a minute and 600 an hour; 60 new anonymous documents a minute,
1,000 an hour and 5,000 a day. Only successful requests count. Over a ceiling
you get `503 service_busy` with `Retry-After`; signed-in publishing and
exports aren't affected.

When a limit is hit you get `429`:

```json
{
  "error": "rate_limited",
  "message": "Too many publish requests. Try again later.",
  "docs_url": "https://docs.opendocs.cc/errors#rate-limited"
}
```

The response carries `Retry-After` (seconds to wait; 2 for the concurrent
export limit) and `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`
and `RateLimit-Policy` headers. The CLI waits and retries for you (0.4.6 and
later), so a large publish or export slows down instead of failing.

## Pagination

`GET /api/v1/posts` is the only paginated endpoint:

```json
{
  "posts": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

- `page` defaults to `1`.
- `limit` defaults to `20`; values above `100` are treated as `100`.
- Results are ordered by `updatedAt`, newest first.

Other lists return everything in one response, except
`GET /signature-requests`, which returns the newest 50.

## Practical guidance

- Use modest `limit` values unless you need bigger pages.
- Call `GET /api/v1/posts` to find a `postId` before `POST /posts/:postId/update`.
- On `403 document_limit`, show the `message` to the person; it's written for
  them.
- On `429`, wait `Retry-After` seconds and retry the same request.
