---
title: OpenAPI spec
sidebar_position: 12
description: The machine-readable OpenDocs API description for agents, client generators and tool builders, and what it covers.
---

# OpenAPI spec

OpenDocs publishes an OpenAPI 3 document for agents, client generators and
tool builders:

```text
https://opendocs.cc/openapi.json
```

A copy ships with these docs at `https://docs.opendocs.cc/openapi.json`. Use
the opendocs.cc one; it's the one agent instructions and `skill.md` point to,
and the docs copy can lag behind it.

```bash
curl https://opendocs.cc/openapi.json
```

When you run the docs site locally (`npm run start` in `apps/docs`), the copy
is at `http://localhost:3001/openapi.json`.

## What it covers

The spec describes the core surface: the auth check (`/me`), emailed-code
sign-in, anonymous publishing and claiming, publish and batch publish, post
reads and changes, version history, moves, sharing, exports, projects
(list and create), workspaces and their settings, the export theme
(`/workspace/branding`), team members and invitations, API keys and account
deletion. Errors use the shared `Error` schema (`error`, `message`,
`docs_url`).

These pages document more than the spec does. Not in the spec yet:

- [Integrations](/api-reference/integrations): Google Drive saves and
  signature requests
- [Projects](/api-reference/projects): `GET /projects/default`,
  `GET /projects/resolve`, `PATCH` and `DELETE /projects/:projectId`
- Invitee-side team routes and auto-join
  ([Agent endpoints](/api-reference/agent-endpoints#team-invitations-from-the-invitees-side-leaving-and-auto-join))
- `DELETE /workspace`, `POST /workspace/default-sort`,
  `POST /profile/username`, `GET`/`POST /profile`, avatar upload and image
  presign
- Public raw Markdown, the public workspace zip and the free converter

When the spec and these pages disagree, the pages are newer.

## Auth model

The spec declares two security schemes:

- `bearerAuth`: `Authorization: Bearer od_live_...`, for agents, the CLI and
  scripts.
- `cookieAuth`: the dashboard's session cookie. Routes marked only with it
  don't accept API keys.

## Notes for agents

- Start from local Markdown files? Use the CLI (`opendocs publish`); it handles
  state, conflicts, images and retries.
- Building a service or a custom tool? Call the API directly.
- `POST /api/v1/publish/batch` is the right call for a folder of files.
- `GET /api/v1/workspaces` lists the workspace slugs `opendocs workspace use`
  accepts.
- Send `X-OpenDocs-Client: <your-agent>` on every request.
