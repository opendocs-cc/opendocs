---
title: Account API
sidebar_position: 11
description: Check whether an account can be deleted, and delete it.
---

# Account API

Account deletion is a dashboard action. Both endpoints are **session only**;
an API key gets `401 unauthorized`.

## `GET /api/v1/account/delete-check`

Whether the signed-in account can be deleted right now.

```json
{ "canDelete": true }
```

Deletion is blocked by an active paid subscription, or by a Team workspace you
own that still has other active members:

```json
{
  "canDelete": false,
  "reason": "active_plan"
}
```

```json
{
  "canDelete": false,
  "reason": "team_workspace_with_members",
  "workspaces": [
    { "id": "ws_123", "name": "Halvard", "memberCount": 4 }
  ]
}
```

Cancel the subscription first, or transfer or empty those workspaces.

## `DELETE /api/v1/account`

Deletes the signed-in account and its personal data. Workspaces you own and
their documents are deleted with it. Billing history for canceled
subscriptions is kept for accounting, with the user and workspace references
removed.

Status `204 No Content` on success.

| Status | Code | When |
| --- | --- | --- |
| `401` | `error: "unauthorized"` | No valid session |
| `409` | `code: "active_plan"` | You have an active Pro or Team subscription |
| `409` | `code: "team_workspace_with_members"` | You own a Team workspace with other active members |

The `409` body is the delete-check result plus `code`, and has no `error`
field:

```json
{
  "code": "team_workspace_with_members",
  "canDelete": false,
  "reason": "team_workspace_with_members",
  "workspaces": [{ "id": "ws_123", "name": "Halvard", "memberCount": 4 }]
}
```

## Related pages

- [Plans and limits](/getting-started/plans-and-limits)
- [Error codes](/errors#active-plan)
