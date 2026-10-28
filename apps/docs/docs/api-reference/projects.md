---
title: Projects endpoints
sidebar_position: 5
description: List, resolve, create, rename and delete projects inside a workspace.
---

# Projects endpoints

Projects group documents inside a workspace. Every workspace has a Default
project, which can't be renamed or deleted. Default-project documents live
at `/<workspace>/<slug>`; others at `/<workspace>/projects/<project>/<slug>`.

All endpoints accept an API key or a session.

| Action | Who |
| --- | --- |
| List, resolve | Any active member |
| Create | Any active member |
| Rename, change slug, delete | Owners and admins |

## The project record

```json
{
  "id": "proj_456",
  "workspaceId": "ws_123",
  "name": "Investors",
  "slug": "investors",
  "isDefault": false
}
```

Project slugs are 1 to 64 characters of lowercase letters, numbers and single
hyphens. `tag`, `tags`, `project`, `projects`, `new`, `edit` and `settings` are
reserved.

## `GET /api/v1/projects?workspaceId=...`

Lists the workspace's projects, Default first, then by name. Each one carries
enough for an agent to decide where a new document belongs:

```json
{
  "projects": [
    {
      "id": "proj_123",
      "workspaceId": "ws_123",
      "name": "Default",
      "slug": "default",
      "isDefault": true,
      "postCount": 14,
      "updatedAt": "2026-01-10T12:00:00.000Z",
      "recentTitles": ["Hiring plan 2027", "Office move checklist"],
      "lastPublishedAt": "2026-10-20T16:04:00.000Z"
    },
    {
      "id": "proj_456",
      "workspaceId": "ws_123",
      "name": "Investors",
      "slug": "investors",
      "isDefault": false,
      "postCount": 6,
      "updatedAt": "2026-03-02T09:00:00.000Z",
      "recentTitles": ["Q3 investor update", "Q2 investor update", "Seed round memo"],
      "lastPublishedAt": "2026-10-12T10:00:00.000Z"
    }
  ],
  "defaultProject": { "id": "proj_123", "name": "Default", "slug": "default", "isDefault": true, "...": "..." }
}
```

- `postCount` counts every document in the project, published or not.
- `recentTitles` holds up to three of the most recently updated published
  titles you can read.
- `lastPublishedAt` is when the newest of those was last updated, or `null`.

## `GET /api/v1/projects/default?workspaceId=...`

```json
{ "project": { "id": "proj_123", "workspaceId": "ws_123", "name": "Default", "slug": "default", "isDefault": true } }
```

## `GET /api/v1/projects/resolve?workspaceId=...&projectSlug=...`

Looks a project up by `projectSlug` or `projectId` (omit both for the Default
project). Returns `{ "project": { ... } }`, or `404 not_found` when there's no
match or you aren't a member.

## `POST /api/v1/projects`

```json
{
  "workspaceId": "ws_123",
  "name": "Board",
  "slug": "board"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `workspaceId` | yes | |
| `name` | yes | 1 to 120 characters |
| `slug` | no | Up to 64 characters. Without it, a slug is made from the name and suffixed (`board-2`) if taken or reserved |

Status `201`: `{ "project": { ... } }`.

An explicit `slug` that another project in the workspace already uses isn't
suffixed; the request fails with `409 slug_taken`. Pick another slug or leave
`slug` out.

## `PATCH /api/v1/projects/:projectId`

Renames a project or changes its slug. Send at least one field. Changing the
slug changes the URL of every document in the project.

```json
{
  "name": "Board of directors",
  "slug": "board-of-directors"
}
```

Returns `{ "project": { ... } }`.

## `DELETE /api/v1/projects/:projectId`

Deletes an empty, non-default project. Move or delete its documents first.

```json
{ "deleted": true, "projectId": "proj_789" }
```

## Errors

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_request` | Missing `workspaceId` or `name`, or `PATCH` with neither field |
| `400` | `invalid_slug` | The slug doesn't fit the rules above |
| `400` | `reserved_slug` | A reserved project slug |
| `400` | `default_project` | Renaming or deleting the Default project |
| `400` | `project_not_empty` | Deleting a project that still has documents (`postCount` is included) |
| `403` | `forbidden` | You aren't an active member, or you're a member trying to rename or delete |
| `404` | `not_found` | No such project (rename, delete, resolve) |
| `409` | `slug_taken` | Another project in the workspace has that slug (create with an explicit `slug`, or rename) |

## Using projects with documents

`POST /publish` takes `projectId` or `projectSlug`. The list, get, raw,
update, export and delete routes take `?projectId=` to scope a slug. Move a
document with
[`POST /posts/:postId/move`](/api-reference/agent-endpoints#moving-between-projects).

## Related pages

- [Projects](/publishing/projects): how projects work
- [Publish endpoints](/api-reference/publish)
- [Agent endpoints](/api-reference/agent-endpoints)
