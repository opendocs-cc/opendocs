---
title: Agent endpoints
description: Anonymous documents, version history and restore, conflicts, moves, sharing, workspace creation, joining workspaces and the export theme API.
---

# Agent endpoints

The endpoints behind the CLI's `--anonymous`, `claim`, `history`, `rollback`,
`move`, `share`, `workspace create`, `invitations`/`join` and `theme`
commands. All accept `Authorization: Bearer od_live_...` or a session, except
where noted. The machine-readable spec is at
[opendocs.cc/openapi.json](https://opendocs.cc/openapi.json).

## Anonymous documents (no API key)

| Endpoint | Auth | Body | Notes |
| --- | --- | --- | --- |
| `POST /api/v1/anonymous/publish` | None | `{ "markdown", "title"? }` | Status `201`. Returns `id`, `title`, `url`, `claimToken`, `claimUrl`, `expiresAt` (24 hours from now), `anonymous: true` and a `message` for the person. Markdown up to 512 KB (UTF-8 bytes). |
| `PUT /api/v1/anonymous/:id` | None | `{ "markdown", "title"?, "claimToken" }` | Replaces the content. Doesn't extend the expiry. Returns `id`, `title`, `url`, `expiresAt`. |
| `POST /api/v1/anonymous/:id/report` | None | `{ "reason", "details"? }` | Status `202`. Reports the page; `reason` is `spam`, `phishing`, `malware`, `illegal`, `personal` or `other`, `details` up to 500 characters. Reports from 3 different addresses hide the page until it's reviewed. |
| `POST /api/v1/anonymous/claim` | API key or session | `{ "claimToken", "workspaceId", "projectId"?, "projectSlug"?, "visibility"?, "confirmPublic"? }` | Status `201`. Publishes the content as a normal document (visibility `workspace` unless you say otherwise) and deletes the anonymous copy, so its link stops working. Returns the [publish response](/api-reference/publish#response), `publicUrl` included, plus `claimedFrom`. |

Publishing and updating anonymously share one limit: 20 requests an hour per
IP. New documents are also capped at 50 a day per IP, and at 60 a minute,
1,000 an hour and 5,000 a day across everyone (`503 service_busy` past that).
Reports are limited to 5 an hour and 20 a day per IP. The claim token is returned once and stored only as a hash. Anonymous
pages are served at `https://opendocs.cc/a/<id>` with `noindex`, and the claim
URL is `https://opendocs.cc/claim/<token>`.

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_request` | Empty or oversized Markdown, missing `claimToken`, public claim without `confirmPublic` |
| `403` | `invalid_claim_token` | The token doesn't match this document (update) |
| `403` | `hidden` | Readers reported the document and it's under review (update, claim) |
| `403` | `document_limit` | Claiming would put the workspace over its plan's cap |
| `404` | `not_found` | No such anonymous document or token, or the workspace or project doesn't exist for you |
| `410` | `expired` | The 24 hours are up |
| `429` | `rate_limited` | More than 30 anonymous publishes and updates an hour, or 100 new documents a day, from this IP |
| `503` | `service_busy` | Anonymous publishing is at its limit across everyone; wait `Retry-After` seconds |

## Updates, conflicts and unchanged content

`POST /api/v1/posts/:postId/update` accepts `baseVersionNumber`, the version
your local copy came from. If the document has moved past it, nothing is
written and you get `409`:

```json
{
  "error": "version_conflict",
  "message": "The document is at version 4, but your copy is based on version 3. Pull the latest version and re-apply your changes, or retry with force to overwrite.",
  "currentVersionNumber": 4,
  "baseVersionNumber": 3,
  "currentVersionCreatedAt": "2026-10-14T08:30:00.000Z"
}
```

Leave `baseVersionNumber` out to overwrite regardless (the CLI's `--force`).
When the Markdown is byte-identical to the current version, the response has
`"unchanged": true` and no version is created; title, visibility, tag and
project changes still apply.

`GET /api/v1/posts` includes each document's current `versionNumber`, so a
client can detect remote changes with one request. Full details are on
[Post mutation endpoints](/api-reference/post-mutations).

## Version history

| Endpoint | Who | Notes |
| --- | --- | --- |
| `GET /api/v1/posts/:postId/versions` | Anyone who can read it | `{ "postId", "versions": [...] }`, newest first. Each version has `id`, `versionNumber`, `createdAt`, `createdBy` (username), `client`, `contentHash`, `restoredFromVersion`, `bytes`, `isCurrent`. |
| `GET /api/v1/posts/:postId/versions/:n/raw` | Anyone who can read it | `{ "postId", "versionNumber", "createdAt", "markdown" }`. Fenced `private` blocks are included only for the author and workspace members. |
| `POST /api/v1/posts/:postId/versions/:n/restore` | The author and any active member of its workspace | Publishes version `n` again as a new version, with `restoredFromVersion: n`. |

An unknown version number returns `404 version_not_found`. A restore you
aren't allowed to make returns `403 forbidden`; other failures return
`400 restore_failed`. Slugs resolve the same way as on every other
`/posts/:postId` route (see
[Post IDs and slugs](/api-reference/posts#post-ids-and-slugs)).

## Moving between projects

`POST /api/v1/posts/:postId/move` with `{ "projectSlug": "archive" }` (or
`projectId`). The author, workspace owners and admins can move a document. If
the slug is taken in the target project the document gets a `-2`-style
suffix, so its URL changes:

```json
{
  "postId": "8d0f3c1e-2b4a-4c6d-9e8f-7a6b5c4d3e2f",
  "slug": "q3-investor-update",
  "url": "/halvard/projects/archive/q3-investor-update",
  "publicUrl": "https://opendocs.cc/halvard/projects/archive/q3-investor-update",
  "projectId": "proj_999",
  "projectSlug": "archive",
  "projectName": "Archive",
  "isDefaultProject": false,
  "moved": true,
  "previousSlug": "q3-investor-update"
}
```

Moving to the project it's already in returns `"moved": false`. Errors:
`400 invalid_request` (neither field), `403 forbidden`,
`404 project_not_found`, `400 move_failed`.

## Sharing with people outside the workspace

| Endpoint | Body | Response |
| --- | --- | --- |
| `GET /api/v1/posts/:postId/share` | None | `{ "postId", "emails": [...], "domains": [...] }` |
| `POST /api/v1/posts/:postId/share` | `{ "emails": [...], "domains": [...], "notify": true }` | The full lists, plus `added: { emails, domains }`, `notified` (emails sent) and `url` |
| `DELETE /api/v1/posts/:postId/share` | `{ "emails": [...], "domains": [...] }` | The remaining lists |

- Only the author, workspace owners and admins can read or change sharing.
- Up to 50 emails and 20 domains per request, at least one of either. Domains
  look like `halvard.example`; a leading `@` is dropped.
- `notify` (default `true`) emails a link to newly added addresses.
- A guest reads the document after signing in with that email address, and
  the address must be verified (emailed-code sign-in and Google or GitHub
  sign-in verify it). Guests see only the documents shared with them.
- Unpublished documents can't be shared (`400 share_failed`). Other errors:
  `403 forbidden`, `400 unshare_failed`.

## Workspaces

`POST /api/v1/workspaces` with `{ "name": "Halvard Labs", "slug"?: "halvard-labs" }`
creates a workspace you own and returns
`{ "workspace": { ..., "role": "owner" }, "defaultProject": { ... } }`. Plan
limits apply (`403 plan_limit`). Details on
[Workspaces API](/api-reference/workspaces#post-apiv1workspaces).

## Team: invitations from the invitee's side, leaving and auto-join

| Endpoint | Notes |
| --- | --- |
| `GET /api/v1/me/invitations` | `{ "emailVerified", "invitations", "joinable" }`. `invitations` are unexpired invitations to your email (`id`, `workspaceId`, `workspaceName`, `workspaceSlug`, `role`, `invitedByName`, `expiresAt`); `joinable` are workspaces whose auto-join domain matches your email (`workspaceId`, `workspaceName`, `workspaceSlug`, `domain`). Both are empty until your email is verified and leave out workspaces you're already in. |
| `POST /api/v1/invitations/:id/accept` | Accept without the email link. Returns `{ "workspace": { "id", "name", "slug" }, "role", "alreadyMember" }`. |
| `POST /api/v1/invitations/:id/decline` | Deletes the invitation. Returns `{ "success": true, "workspaceSlug" }`. |
| `POST /api/v1/workspaces/:slugOrId/join` | Join as a `member` through an auto-join domain that matches your verified email. Same response as accept. |
| `POST /api/v1/workspace/leave` | Body `{ "workspaceId" }`. Returns `{ "success": true, "remainingWorkspaces": [{ "id", "slug", "name" }] }`. |
| `GET /api/v1/workspace/auto-join?workspaceId=` | Any member. `{ "domains": [{ "domain", "createdAt" }] }`. |
| `POST` / `DELETE /api/v1/workspace/auto-join` | Body `{ "workspaceId", "domain" }`. Owners and admins. Returns the updated `domains`. You can only add your own verified email's domain, never a personal email provider's. |

| Status | `error` | When |
| --- | --- | --- |
| `400` | `missing_workspace_id` | `GET /workspace/auto-join` without `workspaceId` |
| `400` | `invalid_domain` | The domain doesn't look like `halvard.example` |
| `400` | `consumer_domain` | A personal email provider such as gmail.com |
| `402` | `billing_failed` | Joining needed a Team seat and billing couldn't be updated |
| `403` | `email_not_verified` | Your email isn't verified yet; sign in with an emailed code first |
| `403` | `member_limit` | The workspace is at its plan's member cap |
| `403` | `domain_mismatch` | The domain isn't your own email's (includes `domain` and `yourDomain`) |
| `403` | `forbidden` | A member trying to change auto-join domains |
| `404` | `not_found` | No such invitation for your email, no matching auto-join rule, or you aren't a member |
| `409` | `owner_cannot_leave` | Owners can't leave; transfer ownership or delete the workspace |
| `410` | `expired` | The invitation has expired |

Admin-side invite, list, resend, cancel, role and remove endpoints are on
[Team and invitations](/api-reference/team-and-invitations); they accept API
keys too. Every way of joining enforces the plan's member cap and Team seats.

## Projects

`GET /api/v1/projects?workspaceId=` returns each project's `postCount`,
`recentTitles` (up to three, only titles you can read) and `lastPublishedAt`,
so an agent can decide where a new document belongs. See
[Projects endpoints](/api-reference/projects).

## Export theme

`GET /api/v1/workspace/branding?workspaceId=` returns the workspace's export
theme and everything needed to change it well. Any member can read it, on any
plan.

```json
{
  "workspace": { "id": "ws_123", "slug": "halvard", "name": "Halvard" },
  "role": "owner",
  "tier": "pro",
  "canEdit": true,
  "canEditFooter": true,
  "branding": {
    "brandColor": "#13294B",
    "font": "IBM Plex Sans",
    "preset": "boardroom",
    "contrast": { "contrast": 14.5, "level": "great" },
    "logoUrl": null,
    "showLogoInExports": false,
    "footer": { "enabled": true, "companyName": null, "tagline": null, "linkUrl": null, "linkLabel": null }
  },
  "presets": [{ "id": "boardroom", "name": "Boardroom", "brandColor": "#13294B", "fontId": "IBM Plex Sans", "description": "..." }],
  "fonts": [{ "id": "Merriweather", "label": "Merriweather", "category": "serif", "description": "..." }],
  "guidelines": { "minContrast": 4.5, "recommendedContrast": 7, "rules": ["..."] }
}
```

- `canEdit` is `true` for owners and admins, on any plan.
- `canEditFooter` is `true` for owners and admins on Pro or Team. On Free,
  `footer` shows the "Made with OpenDocs" footer that Free exports print.
- `preset` is the preset whose color and font match the current settings, or
  `null`.
- There are 9 presets (`classic`, `boardroom`, `editorial`, `research`,
  `studio`, `field-guide`, `letterpress`, `terminal`, `launch`) and 10 fonts.

`PATCH /api/v1/workspace/branding` applies a preset and/or individual fields
in one write. Owners and admins, on any plan; the `footer` field needs Pro or
Team. Agents should ask the person before changing it: it affects every export
in the workspace.

```json
{
  "workspaceId": "ws_123",
  "preset": "editorial",
  "brandColor": "#0B3D5C",
  "font": "Inter",
  "showLogoInExports": true,
  "footer": { "tagline": "Board and investor reporting", "linkUrl": "halvard.example" }
}
```

- Every field except `workspaceId` is optional; send at least one. Unknown
  fields are rejected (`400 invalid_request`).
- An explicit `brandColor` or `font` overrides the preset's. `brandColor` is
  hex with or without `#`; `font` matches case-insensitively.
- Footer fields you leave out keep their value. `companyName`, `tagline` and
  `linkLabel` are up to 120 characters; `linkUrl` gets `https://` if it has no
  scheme.
- The response is the same shape as the `GET`.

| Status | `error` | When |
| --- | --- | --- |
| `400` | `missing_workspace_id` | `GET` without `workspaceId` |
| `400` | `invalid_color` | `brandColor` isn't a hex color |
| `400` | `low_contrast` | The color is lighter than 4.5:1 against white. Includes `contrast` and `minContrast`. Pass `"allowLowContrast": true` to save it anyway |
| `400` | `invalid_preset` | Unknown preset. Includes `presets` |
| `400` | `invalid_font` | Unknown font. Includes `fonts` |
| `400` | `invalid_footer` | A footer value fails validation |
| `400` | `nothing_to_change` | No fields to apply |
| `403` | `forbidden` | You're a member, not an owner or admin |
| `403` | `plan_required` | A `footer` change on a Free workspace. Includes `tier` |
| `404` | `not_found` | No such workspace, or you aren't a member |

Upload a logo with `POST /api/v1/workspace/logo/upload` (multipart `file` and
`workspaceId`; JPEG, PNG, WebP, GIF or SVG up to 2 MB) and remove it with
`POST /api/v1/workspace/logo` `{ "workspaceId", "logoUrl": null }`. Both accept
API keys, need an owner or admin, and work on any plan, as does showing the
logo in exports. See [Workspaces API](/api-reference/workspaces#branding).
