---
title: Onboarding and profile
sidebar_position: 4
description: Finish dashboard onboarding, read and update your profile and username, upload an avatar, and presign image uploads.
---

# Onboarding and profile

The endpoints a new dashboard account uses in its first minutes: pick a
username, create the first workspace, then manage profile fields and images.
Agents rarely need them: the
[emailed-code flow](/api-reference/authentication#getting-a-key-with-an-emailed-code)
does onboarding itself, and the image presign endpoint at the end is the one
the CLI uses on every publish.

Auth differs per endpoint and is noted on each.

## `POST /api/v1/onboarding`

**Session only.** Claims a username and creates (or, for invited people,
skips) the first workspace. When it creates the workspace it also creates its
Default project and an API key named `Default`.

### Request body

```json
{
  "username": "dana",
  "fullName": "Dana Reyes",
  "workspaceName": "Halvard",
  "workspaceSlug": "halvard"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `username` | yes | 3 to 32 characters, lowercase `a-z 0-9 _ -`. Must pass the [username rules](/api-reference/usernames). |
| `fullName` | no | Up to 120 characters. Only filled in if your profile has no name yet. |
| `workspaceName` | for new accounts | 2 to 120 characters. Omit it if you already belong to a workspace (for example, you accepted an invitation). |
| `workspaceSlug` | no | 3 to 32 characters, lowercase `a-z 0-9 _ -`. The first segment of every document URL. Generated from `workspaceName` when omitted. |

### Response

The [onboarding state](/api-reference/me#onboarding) plus the new key:

```json
{
  "hasUsername": true,
  "hasWorkspace": true,
  "username": "dana",
  "workspace": {
    "id": "ws_123",
    "name": "Halvard",
    "slug": "halvard",
    "defaultVisibility": "workspace",
    "defaultProject": { "id": "proj_123", "workspaceId": "ws_123", "name": "Default", "slug": "default", "isDefault": true }
  },
  "completed": true,
  "apiKey": {
    "id": "e8a0c2b4-6d8f-4e1a-9c3b-5d7f9a1c3e5b",
    "label": "Default",
    "keyHint": "77f0",
    "plaintext": "od_live_0000example0000example0000example",
    "createdAt": "2026-04-17T10:15:00.000Z"
  },
  "adEventId": "registration:..."
}
```

`apiKey` is `null` unless this call created your first workspace. Save
`apiKey.plaintext` now; it isn't shown again. `adEventId` is used by the
dashboard and can be ignored.

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_request` | A field fails the length rules above |
| `400` | `onboarding_failed` | Username invalid, reserved or taken; workspace slug invalid, reserved or taken; or `workspaceName` missing for a new account. The `message` is always "Unable to complete onboarding." |
| `401` | `unauthorized` | No session cookie |

## `GET /api/v1/profile`

API key or session.

```json
{
  "profile": {
    "username": "dana",
    "fullName": "Dana Reyes",
    "bio": null,
    "profilePictureUrl": "https://cdn.opendocs.cc/avatars/usr_123.png"
  }
}
```

`profile` is `null` before onboarding. `fullName`, `bio` and
`profilePictureUrl` are `null` when unset.

## `POST /api/v1/profile`

**Session only.** Updates profile fields. Omit a field to leave it unchanged;
pass `null` to clear it.

```json
{
  "fullName": "Dana Reyes",
  "profilePictureUrl": "https://halvard.example/dana.png"
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `fullName` | string or null | Up to 120 characters |
| `profilePictureUrl` | string or null | Up to 2048 characters |

Returns the same shape as `GET /profile`.

## `POST /api/v1/profile/username`

**Session only.** Renames your username. Your workspace slug, and so your
document URLs, don't change.

```json
{ "username": "dana-reyes" }
```

Returns the same shape as `GET /profile`. Renaming to your current username
is a no-op.

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_request` | Shorter than 3 or longer than 32 characters |
| `400` | `invalid_username` | Characters other than lowercase `a-z 0-9 _ -` |
| `400` | `reserved_username` | A reserved name such as `docs` or `pricing` |
| `400` | `no_username` | You haven't finished onboarding |
| `409` | `username_taken` | Someone else has it |

## `POST /api/v1/profile/avatar/upload`

**Session only.** Multipart upload that stores the image and sets
`profilePictureUrl` in one step.

- Form field `file`
- Up to 2 MB
- JPEG, PNG, WebP, GIF or SVG

```json
{
  "profilePictureUrl": "https://cdn.opendocs.cc/avatars/usr_123.png",
  "profile": { "username": "dana", "fullName": "Dana Reyes", "bio": null, "profilePictureUrl": "https://cdn.opendocs.cc/avatars/usr_123.png" }
}
```

| Status | `error` | When |
| --- | --- | --- |
| `400` | `missing_file` | No `file` field |
| `400` | `unsupported_mime` | Not JPEG, PNG, WebP, GIF or SVG |
| `413` | `file_too_large` | Over 2 MB |
| `503` | `storage_not_configured` | Object storage isn't set up on this server |

## `POST /api/v1/storage/images/presign-upload`

API key or session. Returns a short-lived URL to `PUT` an image straight to
object storage. The CLI uses it to upload local images referenced in Markdown
before it publishes. (Remote images in published Markdown are copied to
OpenDocs storage automatically, so you only need this for local files.)

```json
{
  "workspaceId": "ws_123",
  "contentType": "image/png",
  "contentLength": 348912,
  "filename": "q3-revenue-chart.png"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `workspaceId` | yes | A workspace you're an active member of |
| `contentType` | yes | `image/jpeg`, `image/png`, `image/webp`, `image/gif` or `image/svg+xml` |
| `contentLength` | yes | Size in bytes, a positive integer up to 10 MB (10485760) |
| `filename` | no | Up to 255 characters. Informational only |

```json
{
  "uploadUrl": "https://<storage-host>/...?X-Amz-Signature=...",
  "publicUrl": "https://cdn.opendocs.cc/images/ws_123/0b7c....png",
  "key": "images/ws_123/0b7c....png",
  "expiresInSeconds": 300,
  "maxBytes": 10485760
}
```

1. `POST /storage/images/presign-upload` with the type and size.
2. `PUT` the bytes to `uploadUrl` with matching `Content-Type` and
   `Content-Length` headers. The URL is signed, so send no auth header.
3. Put `publicUrl` in your Markdown: `![Q3 revenue](<publicUrl>)`.
4. Publish the Markdown.

The URL expires after 5 minutes; request a new one if the PUT is refused.

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_request` | Missing field, wrong type, or `contentLength` over 10 MB |
| `400` | `unsupported_mime` | `contentType` isn't one of the image types above |
| `403` | `forbidden` | You aren't an active member of `workspaceId` |
| `503` | `storage_not_configured` | Object storage isn't set up on this server |

## Typical dashboard sign-up sequence

1. `POST /api/v1/onboarding`: username, workspace, first key.
2. `GET /api/v1/me`: workspace and quota for the UI.
3. `POST /api/v1/profile/avatar/upload`: optional avatar.
4. `POST /api/v1/workspace/logo/upload`: optional workspace logo (owner or
   admin; see [Workspaces API](/api-reference/workspaces)).

## Related pages

- [Authentication](/api-reference/authentication): sessions, keys and the emailed-code flow
- [API keys](/api-reference/api-keys): create and revoke keys
- [Usernames and workspace slugs](/api-reference/usernames): the two identifiers
- [Workspaces API](/api-reference/workspaces): settings for the workspace onboarding creates
