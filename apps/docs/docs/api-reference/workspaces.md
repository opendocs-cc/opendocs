---
title: Workspaces API
sidebar_position: 9
description: List, create and delete workspaces, and change a workspace's name, slug, branding, settings and custom domain.
---

# Workspaces API

The workspace is the sharing boundary and the first segment of every document
URL: `opendocs.cc/<workspace-slug>/<post-slug>`. Team members and invitations
are on [their own page](/api-reference/team-and-invitations).

## Auth

| Accepts an API key | Session only |
| --- | --- |
| `GET /workspaces`, `POST /workspaces`, `POST /workspace/logo`, `POST /workspace/logo/upload`, `GET` and `PATCH /workspace/branding`, the [custom domain](#custom-domain) routes | Everything else on this page |

A session-only route answers an API key with `401 unauthorized`. Agents change
the export theme through `PATCH /workspace/branding`, described under
[Export theme](/api-reference/agent-endpoints#export-theme).

All routes fall under the general rate limit (600 requests a minute per IP).

## Who can change what

| Setting | Who |
| --- | --- |
| Name, slug, bio, logo | Owners and admins |
| Brand color, export font, logo in exports | Owners and admins, any plan |
| Export footer | Owners and admins, on Pro or Team (`403 plan_required` on Free, whose exports keep the "Made with OpenDocs" footer) |
| Custom domain | Owners and admins, on Pro or Team (`403 plan_required` on Free). Members can read it |
| Allow public documents, default sort, delete the workspace | The owner only |

## The workspace record

`GET /api/v1/workspace` returns this shape:

```json
{
  "id": "ws_123",
  "name": "Halvard",
  "slug": "halvard",
  "plan": "free",
  "defaultVisibility": "workspace",
  "defaultSort": "recently-updated",
  "allowPublicDocuments": true,
  "bio": "Internal docs for Halvard.",
  "brandColor": "#13294B",
  "logoUrl": "https://cdn.opendocs.cc/logos/ws_123.png",
  "showLogoInExports": true,
  "exportFontMain": "IBM Plex Sans",
  "exportFooterEnabled": true,
  "exportFooterCompanyName": "Halvard",
  "exportFooterTagline": "Board and investor reporting",
  "exportFooterLinkUrl": "https://halvard.example",
  "exportFooterLinkLabel": "halvard.example",
  "ownerUserId": "usr_123",
  "role": "owner"
}
```

`role` is your role (`owner`, `admin` or `member`). Unset fields are `null`.
`plan` is the stored value. The plan that decides features is Team when that's
stored, otherwise the owner's billing plan; read it from
[`GET /me`](/api-reference/me) (`quota.documents.plan`) or
[`GET /workspace/branding`](/api-reference/agent-endpoints#export-theme) (`tier`).

## `GET /api/v1/workspaces`

**Accepts an API key.** Every workspace you're an active member of, in the
order you joined them. The CLI uses it for `opendocs workspace list` and
`opendocs workspace use <slug>`.

```json
{
  "workspaces": [
    { "id": "ws_123", "name": "Halvard", "slug": "halvard", "role": "owner" },
    { "id": "ws_456", "name": "Halvard Labs", "slug": "halvard-labs", "role": "member" }
  ]
}
```

Pending invitations aren't included. With no memberships you get
`{ "workspaces": [] }`.

## `POST /api/v1/workspaces`

**Accepts an API key.** Creates a workspace you own, with a Default project
(`opendocs workspace create`).

```json
{ "name": "Halvard Labs", "slug": "halvard-labs" }
```

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | 2 to 120 characters |
| `slug` | no | 3 to 32 characters, lowercase `a-z 0-9 _ -`. Made from the name when omitted |

Status `201`:

```json
{
  "workspace": { "id": "ws_456", "name": "Halvard Labs", "slug": "halvard-labs", "role": "owner" },
  "defaultProject": { "id": "proj_901", "workspaceId": "ws_456", "name": "Default", "slug": "default", "isDefault": true }
}
```

How many workspaces you can own depends on your plan: 1 on Free, 2 on Pro
(plus paid add-ons), unlimited on Team. See
[Plans and limits](/getting-started/plans-and-limits).

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_request` | `name` or `slug` length out of range |
| `400` | `invalid_slug` | The slug has characters other than `a-z 0-9 _ -` |
| `400` | `reserved_slug` | The slug is reserved (`docs`, `pricing`, `integrations` and others) |
| `403` | `plan_limit` | You own as many workspaces as your plan allows. Includes `plan` and `limit` |
| `409` | `slug_taken` | Another workspace has the slug |

## `GET /api/v1/workspace`

**Session only.** One workspace's settings, as `{ "workspace": { ... } }`.

| Query | Required | Notes |
| --- | --- | --- |
| `workspaceId` | no | Which workspace. Without it you get your earliest-joined active membership, the one the CLI picks at login; pass it if you have several. |

`workspace` is `null` when you aren't an active member.

## `POST /api/v1/workspace`

**Session only.** Renames the workspace. Owners and admins.

```json
{ "workspaceId": "ws_123", "name": "Halvard Group" }
```

`name` is 2 to 120 characters. Returns `{ "name": "Halvard Group" }`.

## `DELETE /api/v1/workspace`

**Session only.** Deletes a workspace and everything in it. The owner only,
and not your last workspace.

```json
{ "workspaceId": "ws_456", "confirmSlug": "halvard-labs" }
```

`confirmSlug` must equal the workspace's slug.

```json
{ "success": true, "deletedWorkspaceId": "ws_456", "nextWorkspaceId": "ws_123" }
```

| Status | `error` | When |
| --- | --- | --- |
| `400` | `confirmation_mismatch` | `confirmSlug` doesn't match |
| `403` | `forbidden` | You aren't the owner |
| `404` | `not_found` | No such workspace |
| `409` | `last_workspace` | It's your only workspace |

## `GET /api/v1/workspaces/current`

**Session only.** The workspace the onboarding flow reads:
`{ "workspace": { "id", "name", "slug", "defaultVisibility", "defaultProject" } }`,
or `{ "workspace": null }`. Agents should use [`GET /api/v1/me`](/api-reference/me).

## `GET /api/v1/workspace/check-slug`

**Session only.** Availability check for the slug picker. See
[Usernames and workspace slugs](/api-reference/usernames#get-apiv1workspacecheck-slug)
for the response.

## `POST /api/v1/workspace/slug`

**Session only.** Changes the workspace slug. Owners and admins. Every
document URL under `/<old-slug>/` stops working; old slugs aren't redirected.

```json
{ "workspaceId": "ws_123", "slug": "halvard-group" }
```

Returns `{ "slug": "halvard-group" }`. Sending the current slug returns
`200` with `{ "slug": "...", "unchanged": true }`.

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_request` | `slug` shorter than 3 or longer than 32 characters |
| `400` | `invalid_slug` | Characters other than `a-z 0-9 _ -` |
| `400` | `reserved_slug` | A reserved slug |
| `403` | `forbidden` | You aren't an owner or admin |
| `404` | `not_found` | No such workspace |
| `409` | `slug_taken` | Another workspace has it |

## Branding

These per-field routes back the dashboard's settings page and are session
only. Agents use [`PATCH /workspace/branding`](/api-reference/agent-endpoints#export-theme),
which takes presets and checks contrast.

### `POST /api/v1/workspace/brand-color`

Any plan. Owners and admins.

```json
{ "workspaceId": "ws_123", "color": "#13294B" }
```

`color` is `#` plus 6 hex digits. Returns `{ "brandColor": "#13294B" }`. This
route doesn't check contrast; `PATCH /workspace/branding` does.

### `POST /api/v1/workspace/logo`

**Accepts an API key.** Owners and admins, any plan. Sets the logo to a URL,
or clears it.

```json
{ "workspaceId": "ws_123", "logoUrl": "https://halvard.example/logo.png" }
```

`logoUrl` must be a URL or `null`. Returns `{ "logoUrl": "..." }`.

### `POST /api/v1/workspace/logo/upload`

**Accepts an API key.** Owners and admins, any plan. Multipart upload that
stores the image and sets `logoUrl`.

- Form field `file`: the image
- Form field `workspaceId`: required
- Up to 2 MB; JPEG, PNG, WebP, GIF or SVG

```json
{
  "logoUrl": "https://cdn.opendocs.cc/logos/ws_123.png",
  "workspace": { "logoUrl": "https://cdn.opendocs.cc/logos/ws_123.png" }
}
```

| Status | `error` | When |
| --- | --- | --- |
| `400` | `missing_workspace_id` | No `workspaceId` form field |
| `400` | `missing_file` | No `file` field |
| `400` | `unsupported_mime` | Not JPEG, PNG, WebP, GIF or SVG |
| `403` | `forbidden` | You aren't an owner or admin |
| `413` | `file_too_large` | Over 2 MB |
| `503` | `storage_not_configured` | Object storage isn't set up on this server |

### `POST /api/v1/workspace/logo-in-exports`

Any plan. Owners and admins. Whether exports show the logo.

```json
{ "workspaceId": "ws_123", "show": true }
```

Returns `{ "showLogoInExports": true }`.

### `POST /api/v1/workspace/bio`

Owners and admins. The description on the workspace's public page.

```json
{ "workspaceId": "ws_123", "bio": "Board and investor reporting for Halvard." }
```

Up to 500 characters, or `null` to clear. Returns `{ "bio": "..." }`.

## Export customization

### `POST /api/v1/workspace/export-font`

Any plan. Owners and admins.

```json
{ "workspaceId": "ws_123", "font": "Inter" }
```

`null` resets to the default, Arial. Allowed values:

- Sans-serif: `Arial`, `Inter`, `IBM Plex Sans`, `Lato`, `Roboto`, `Manrope`
- Serif: `Merriweather`, `Vollkorn`, `EB Garamond`
- Monospace: `JetBrains Mono`

An unknown font fails validation with `400 invalid_request`
(`font: Unknown font.`). Returns `{ "font": "Inter" }`.

### `POST /api/v1/workspace/export-footer`

Pro and Team. Owners and admins. The footer line on exports.

```json
{
  "workspaceId": "ws_123",
  "enabled": true,
  "companyName": "Halvard",
  "tagline": "Board and investor reporting",
  "linkUrl": "halvard.example",
  "linkLabel": "halvard.example"
}
```

- `enabled` (required) turns the footer on or off.
- `companyName`, `tagline`, `linkLabel`: up to 120 characters each; `null` or
  omitted for none.
- `linkUrl`: a URL up to 2048 characters. Without a scheme, `https://` is
  added.

This route replaces all footer fields at once. Returns the stored values as
`exportFooterEnabled`, `exportFooterCompanyName`, `exportFooterTagline`,
`exportFooterLinkUrl` and `exportFooterLinkLabel`.

## Workspace settings

### `POST /api/v1/workspace/public-documents`

The owner only. Turns `public` visibility on or off for the whole workspace.

```json
{ "workspaceId": "ws_123", "allowed": false }
```

While it's off, `public` documents are visible only to workspace members (and
people they're shared with), and public download links stop working. Turning
it back on restores them. Returns `{ "allowPublicDocuments": false }`.

### `POST /api/v1/workspace/default-sort`

The owner only. How the workspace's public page orders documents.

```json
{ "workspaceId": "ws_123", "value": "recently-updated" }
```

`value` is `recently-updated`, `recently-added`, `title-asc` or `title-desc`.
Returns `{ "defaultSort": "recently-updated" }`.

## Custom domain

A workspace's own domain for its reader pages, such as `notes.halvard.example`.
Pro and Team, one per workspace. **These routes accept an API key.** How it
works for readers, and the DNS side, are in
[Custom domains](/publishing/custom-domains).

### The domain record

`GET`, `PUT` and `POST /check` return the same shape:

```json
{
  "domain": {
    "id": "7f2c...",
    "workspaceId": "ws_123",
    "hostname": "notes.halvard.example",
    "kind": "subdomain",
    "status": "active",
    "state": "active",
    "serving": true,
    "url": "https://notes.halvard.example",
    "records": [
      {
        "type": "CNAME",
        "name": "notes.halvard.example",
        "host": "notes",
        "value": "custom.opendocs.cc",
        "purpose": "routing",
        "check": "ok"
      },
      {
        "type": "TXT",
        "name": "_opendocs.notes.halvard.example",
        "host": "_opendocs.notes",
        "value": "opendocs-verify=Xq3v9...",
        "purpose": "verification",
        "check": "ok"
      }
    ],
    "lastError": null,
    "consecutiveFailures": 0,
    "verifiedAt": "2026-10-20T09:12:00.000Z",
    "lastCheckedAt": "2026-10-25T03:12:00.000Z",
    "failingSince": null,
    "createdAt": "2026-10-20T09:10:00.000Z"
  },
  "plan": { "tier": "pro", "allowed": true }
}
```

- `domain` is `null` when the workspace has none. `plan.allowed` says whether
  the workspace's plan includes custom domains.
- `kind` is `subdomain`. (`apex` exists for servers set up for root domains;
  opendocs.cc connects subdomains only and answers `invalid_hostname` with
  `reason: "apex_unsupported"` for a root domain.)
- `showPoweredBy` says whether the domain's footer shows "Published with
  OpenDocs". Change it with `PATCH /api/v1/workspace/domain`
  `{ "workspaceId", "showPoweredBy" }` (owners and admins, Pro or Team).
- `status` is the DNS status as stored: `pending`, `active` or `misconfigured`
  (three scheduled checks in a row failed).
- `state` is what the dashboard shows: `pending` (waiting for DNS), `verifying`
  (records found in the last 10 minutes; the certificate is issued on the first
  visit), `active`, `misconfigured`, or `paused` when the plan doesn't include
  custom domains.
- `serving` is true when the domain serves the workspace's pages right now.
- `records[].name` is the full name; `host` is the same name relative to the
  domain, for providers that ask for that. `check` is the last check's result
  for the record: `ok`, `missing`, `mismatch`, `conflict`, `proxied`, `error`,
  or `null` before the first check.
- `lastError` is `null`, or `{ "code", "message" }` with the first record that
  failed: `txt_missing`, `txt_mismatch`, `txt_conflict`, `target_missing`,
  `target_mismatch`, `cloudflare_proxied`, `ipv6_mismatch`, `dns_error` or
  `domain_taken`. `message` says what to change.
- `failingSince` is when the current run of failed checks began.

### `GET /api/v1/workspace/domain`

Any member. `?workspaceId=` is required.

### `PUT /api/v1/workspace/domain`

Owners and admins, on Pro or Team. Connects a domain or replaces the
workspace's current one, then checks its records straight away.

```json
{ "workspaceId": "ws_123", "hostname": "notes.halvard.example" }
```

`hostname` may be pasted as a URL (`https://notes.halvard.example/`); only the
name is kept, lowercased, with non-ASCII names in punycode. Sending the same
hostname again keeps its verification token and re-checks. A different
hostname replaces the domain, with a new token, and ends sign-ins on the old
one.

### `POST /api/v1/workspace/domain/check`

Owners and admins. Checks the records now.

```json
{ "workspaceId": "ws_123" }
```

Limited to 12 checks a minute per account. A failed check on an active domain
is reported in `lastError` but doesn't count toward the three failures that
stop it serving; only the background check every 6 hours does.

### `DELETE /api/v1/workspace/domain`

Owners and admins. `?workspaceId=` is required. Stops serving the domain and
ends sign-ins on it.

```json
{ "removed": true, "hostname": "notes.halvard.example" }
```

`removed` is `false` (and `hostname` `null`) when there was no domain.

### Errors

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_request` | `workspaceId` or `hostname` missing |
| `400` | `invalid_hostname` | Not a domain OpenDocs can serve. Includes `reason`: `empty`, `invalid`, `ip_address`, `too_long`, `single_label`, `reserved`, `opendocs` or `apex_unsupported` |
| `403` | `forbidden` | You're a member, not an owner or admin |
| `403` | `plan_required` | The workspace is on Free. Includes `tier` |
| `404` | `not_found` | You aren't a member of the workspace |
| `409` | `domain_taken` | Another workspace has the domain active |
| `429` | `rate_limited` | More than 12 checks a minute |

## Common errors

| Status | `error` | Meaning |
| --- | --- | --- |
| `400` | `invalid_request` | Body failed validation, often a missing `workspaceId` |
| `401` | `unauthorized` | No session (or an API key on a session-only route) |
| `403` | `forbidden` | Not a member, or your role can't make this change |
| `403` | `plan_required` | The export footer or a custom domain on a Free workspace. Includes `tier` |

## Related pages

- [Team and invitations API](/api-reference/team-and-invitations)
- [Agent endpoints](/api-reference/agent-endpoints#export-theme): the export theme API for agents
- [Usernames and workspace slugs](/api-reference/usernames)
- [Plans and limits](/getting-started/plans-and-limits)
- [Custom domains](/publishing/custom-domains)
- [Onboarding and profile](/api-reference/onboarding-and-profile)
