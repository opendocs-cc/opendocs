---
title: Team and invitations API
sidebar_position: 10
description: List members, invite people, change roles, remove members and accept invitations.
---

# Team and invitations API

Membership is how sharing works: every active member of a workspace can read
its `workspace` and `public` documents and edit any of them. These are the
admin-side endpoints. The invitee's side (your own invitations, leaving a
workspace, joining by email domain) is under
[Agent endpoints](/api-reference/agent-endpoints#team-invitations-from-the-invitees-side-leaving-and-auto-join).

All endpoints accept an API key or a session, except
`GET /workspace/team/stats` (session only). They fall under the general rate
limit (600 requests a minute per IP).

## Roles

| Role | What it adds |
| --- | --- |
| `member` | Publish documents, edit any document in the workspace (new versions, tags, restoring a version), create projects, use integrations (unless the workspace limits them to admins). Visibility, moving, sharing, unpublishing and deleting stay with each document's author or an admin. |
| `admin` | Rename the workspace and change its slug, branding and logo; invite, re-role and remove members; rename and delete projects; connect and manage integrations; change the visibility of, move, share, unpublish or delete any document. Can't remove or demote another admin, or touch the owner. |
| `owner` | Everything, plus: remove or demote admins, allow or block public documents, set the default sort, delete the workspace. One per workspace. |

Every edit is a new version and the history records who made it, so any change
can be rolled back.

The person who creates a workspace is its owner. Everyone else joins through an
invitation or an auto-join email domain. Roles work the same on every plan.

## Member caps

| Plan | Members per workspace |
| --- | --- |
| Free | 3 |
| Pro | 5 |
| Team | Unlimited |

On Free and Pro, active members **plus pending invitations** count toward the
cap, so inviting is refused once they reach it (`403 member_limit`). On Team
there's no cap in the app: when someone joins, OpenDocs counts unique active
members across every workspace the subscriber owns and updates the Team seat
quantity first. If billing can't be updated, joining fails with
`402 billing_failed`. See [Plans and limits](/getting-started/plans-and-limits).

:::info `workspaceId` is required
The list routes take `?workspaceId=` (missing: `400 missing_workspace_id`).
`POST /workspace/team/invite` takes it in the body. You must be an active
member of that workspace (`403 forbidden` otherwise). The routes with an `:id`
work from the member or invitation id.
:::

## `GET /api/v1/workspace/team?workspaceId=...`

Active members, in the order they joined. Any member can call it.

```json
{
  "members": [
    {
      "id": "mem_1",
      "userId": "usr_123",
      "name": "Dana Reyes",
      "email": "dana@halvard.example",
      "image": "https://cdn.opendocs.cc/avatars/usr_123.png",
      "role": "owner",
      "joinedAt": "2026-01-10T12:00:00.000Z"
    },
    {
      "id": "mem_2",
      "userId": "usr_456",
      "name": "Sam Okafor",
      "email": "sam@halvard.example",
      "image": null,
      "role": "admin",
      "joinedAt": "2026-02-14T09:30:00.000Z"
    }
  ]
}
```

`id` is the membership id used by the role and remove routes.

## `GET /api/v1/workspace/team/stats?workspaceId=...`

**Session only.** Counts for the dashboard badge.

```json
{ "totalMembers": 3, "pendingInvites": 1, "admins": 2 }
```

`admins` counts owners and admins.

## `GET /api/v1/workspace/team/invitations?workspaceId=...`

Pending, unexpired invitations. Owners and admins; members get `403 forbidden`.

```json
{
  "invitations": [
    {
      "id": "inv_1",
      "email": "lee@halvard.example",
      "role": "member",
      "invitedAt": "2026-10-01T10:15:00.000Z",
      "invitedByName": "Dana Reyes"
    }
  ]
}
```

## `POST /api/v1/workspace/team/invite`

Sends an invitation email (`opendocs invite`). Owners and admins.

```json
{
  "workspaceId": "3f1c9a52-7d4e-4b8a-9c21-5e6f0a7b8c9d",
  "email": "lee@halvard.example",
  "role": "member"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `workspaceId` | yes | The workspace's UUID |
| `email` | yes | Up to 320 characters |
| `role` | yes | `admin` or `member` |

Status `201`:

```json
{
  "invitation": {
    "id": "inv_1",
    "email": "lee@halvard.example",
    "role": "member",
    "invitedAt": "2026-10-24T10:15:00.000Z",
    "invitedByName": "Dana Reyes"
  }
}
```

The invitation expires after 7 days.

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_request` | Missing field, bad email, `role` not `admin`/`member`, `workspaceId` not a UUID |
| `400` | `invite_limit` | The workspace already has 50 pending invitations |
| `403` | `forbidden` | You aren't an owner or admin of `workspaceId` |
| `403` | `member_limit` | Members plus pending invitations are at the plan's cap. Includes `plan` and `limit` |
| `409` | `already_member` | That email is already an active member |
| `409` | `already_invited` | A pending invitation for that email exists |

## `POST /api/v1/workspace/team/invitations/:id/resend`

Sends the email again and resets the expiry to 7 days from now. Owners and
admins. Returns `{ "success": true }`. Errors: `403 forbidden`,
`404 not_found`.

## `DELETE /api/v1/workspace/team/invitations/:id`

Cancels a pending invitation; its link stops working. Owners and admins.
Returns `{ "success": true }`. Errors: `403 forbidden`, `404 not_found`.

## `POST /api/v1/workspace/team/accept-invite`

Accepts an invitation by the token in its email link (`/invite/<token>`). For
accepting by id without the link, see
[Agent endpoints](/api-reference/agent-endpoints#team-invitations-from-the-invitees-side-leaving-and-auto-join).

```json
{ "token": "<token from the invitation link>" }
```

```json
{ "workspaceId": "ws_123", "role": "member" }
```

If you're already a member, the invitation is cleaned up and you get the same
`200` response.

| Status | `error` | When |
| --- | --- | --- |
| `402` | `billing_failed` | A Team seat had to be added and billing couldn't be updated |
| `403` | `forbidden` | Your signed-in email isn't the invited one |
| `403` | `member_limit` | The workspace reached its member cap since the invitation was sent |
| `404` | `not_found` | No invitation has that token |
| `410` | `expired` | The invitation is past its 7 days; ask for a resend |

## `PATCH /api/v1/workspace/team/members/:id/role`

Changes a member's role. Owners and admins; only the owner can demote an
admin. The owner's role can't be changed here.

```json
{ "role": "admin" }
```

`role` is `admin` or `member`.

```json
{
  "member": {
    "id": "mem_2",
    "userId": "usr_456",
    "name": "Sam Okafor",
    "email": "sam@halvard.example",
    "image": null,
    "role": "admin",
    "joinedAt": "2026-02-14T09:30:00.000Z"
  }
}
```

Errors: `400 invalid_request`, `403 forbidden`, `404 not_found`.

## `DELETE /api/v1/workspace/team/members/:id`

Removes a member. Owners and admins; only the owner can remove an admin, and
nobody can remove the owner. Team seats are released when they're no longer
used. Returns `{ "success": true }`. Errors: `403 forbidden`,
`404 not_found`.

## Invitation lifecycle

1. **Send**: `POST /workspace/team/invite`. Pending for 7 days.
2. **Resend**: `POST /workspace/team/invitations/:id/resend`. New email, new
   7-day expiry, same link.
3. **Cancel**: `DELETE /workspace/team/invitations/:id`. The link stops working.
4. **Accept**: by link (`POST /workspace/team/accept-invite`) or by id
   (`POST /invitations/:id/accept`). The person becomes an active member.
5. **Expire**: after 7 days the link returns `410 expired` until resent.

## Related pages

- [Agent endpoints](/api-reference/agent-endpoints): the invitee's side, leaving, auto-join
- [Workspaces API](/api-reference/workspaces): settings, branding, slug
- [Workspaces and team access](/visibility/workspaces-and-team-access): how membership affects visibility
- [Plans and limits](/getting-started/plans-and-limits): member caps per plan
