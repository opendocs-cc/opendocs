---
title: GET /api/v1/me
sidebar_position: 3
description: Return the current user, onboarding state and document quota. The standard check that a key works.
---

# `GET /api/v1/me`

Returns who you are, your onboarding state and the live document quota for a
workspace. Agents call it to check that a key works.

## Auth

API key or session.

## Request

```bash
curl "https://api.opendocs.cc/api/v1/me?workspaceId=ws_123" \
  -H "Authorization: Bearer od_live_xxxxx"
```

| Query | Required | Notes |
| --- | --- | --- |
| `workspaceId` | no | Compute `quota.documents` for this workspace. If you aren't an active member of it, `quota.documents` is `null`. Without it, the quota is for the workspace shown in `onboarding.workspace`. |

If you belong to more than one workspace, pass `workspaceId` so the quota
matches the workspace you're about to publish to. The quota is advisory:
`POST /publish` and `POST /publish/batch` check the cap again themselves.

## Response

```json
{
  "authenticated": true,
  "userId": "usr_123",
  "onboarding": {
    "hasUsername": true,
    "hasWorkspace": true,
    "username": "dana",
    "workspace": {
      "id": "ws_123",
      "name": "Halvard",
      "slug": "halvard",
      "defaultVisibility": "workspace",
      "defaultProject": {
        "id": "proj_123",
        "workspaceId": "ws_123",
        "name": "Default",
        "slug": "default",
        "isDefault": true
      }
    },
    "completed": true
  },
  "quota": {
    "documents": {
      "plan": "free",
      "limit": 50,
      "used": 12,
      "remaining": 38
    }
  }
}
```

## Fields

### `onboarding`

- `hasUsername`, `hasWorkspace`, `completed`: `completed` is `true` once you
  have both a username and a workspace.
- `username`: your profile handle.
- `workspace`: your earliest-joined active workspace, or `null`. It's the
  same one the CLI picks at login. If you belong to several, pass
  `workspaceId` for anything workspace-specific.
  `workspace.slug` is the first segment of document URLs:
  `opendocs.cc/<workspace.slug>/<post-slug>`. List every workspace with
  [`GET /api/v1/workspaces`](/api-reference/workspaces#get-apiv1workspaces).
- `workspace.defaultVisibility`: `private`, `workspace` or `public`.
- `workspace.defaultProject`: the project documents go to when you don't name
  one.

### `quota.documents`

| Field | Type | Description |
| --- | --- | --- |
| `plan` | `"free" \| "pro" \| "team"` | The workspace's effective plan (its owner's plan) |
| `limit` | number or `null` | Published documents allowed. `null` means unlimited (Pro and Team) |
| `used` | number | Published documents in the workspace. Unpublished ones don't count |
| `remaining` | number or `null` | `limit - used`, never below 0. `null` means unlimited |

`quota.documents` is `null` when you have no workspace yet, or when you passed
a `workspaceId` you aren't a member of.

## How the CLI uses it

During login and before a batch publish the CLI calls `/me` to confirm the
key, find the username and workspace, and compare the batch size against
`quota.documents.remaining` so it can stop before sending a batch that would
be rejected.

## Errors

| Status | `error` | When |
| --- | --- | --- |
| `401` | `unauthorized` | Missing, invalid or revoked key |

## Related pages

- [Plans and limits](/getting-started/plans-and-limits): where the quota comes from
- [Publish endpoints](/api-reference/publish): where `document_limit` is enforced
- [Errors and pagination](/api-reference/errors-and-pagination#the-document_limit-error): the `document_limit` body
