---
title: Usernames and workspace slugs
sidebar_position: 11
description: How usernames and workspace slugs differ, and the endpoints that check each one.
---

# Usernames and workspace slugs

OpenDocs has two human-readable identifiers that are easy to mix up.

| | Username | Workspace slug |
| --- | --- | --- |
| Identifies | A person | A workspace |
| Appears in | Your profile and version history (`createdBy`); not in URLs | Every document URL: `opendocs.cc/<workspace-slug>/<post-slug>` |
| Scope | Unique across OpenDocs | Unique across OpenDocs |
| Rules | 3 to 32 characters, lowercase `a-z 0-9 _ -` | 3 to 32 characters, lowercase `a-z 0-9 _ -` |
| Chosen | At sign-up or onboarding; rename with [`POST /profile/username`](/api-reference/onboarding-and-profile#post-apiv1profileusername) | At sign-up or when creating a workspace; change with [`POST /workspace/slug`](/api-reference/workspaces#post-apiv1workspaceslug) |
| Check | `GET /api/v1/usernames/check` | `GET /api/v1/workspace/check-slug` |

Both are lowercased before checking, and both share one reserved list (route
and brand names such as `docs`, `pricing`, `integrations`, `dashboard`,
`claim`, `openapi`).

When an agent signs someone up with an emailed code, the workspace slug is the
same as the username when it's free.

:::tip
To build the URL of a document you're about to publish, use the **workspace
slug** (`onboarding.workspace.slug` from `GET /api/v1/me`, or `slug` from
`GET /api/v1/workspaces`), not the username. Better still, use the `url` the
publish response returns.
:::

## `GET /api/v1/usernames/check`

No auth.

```http
GET /api/v1/usernames/check?username=dana
```

| Query | Required | Description |
| --- | --- | --- |
| `username` | yes | The username to check |

Available:

```json
{ "available": true, "normalized": "dana", "reason": null }
```

Taken:

```json
{ "available": false, "normalized": "dana", "reason": null }
```

Invalid or reserved:

```json
{ "available": false, "normalized": "docs", "reason": "reserved" }
```

`reason` is `invalid` (length or characters), `reserved`, or `null` (available,
or valid but taken).

## `GET /api/v1/workspace/check-slug`

**Session only** (it backs the onboarding form).

```http
GET /api/v1/workspace/check-slug?slug=halvard
```

| Query | Required | Description |
| --- | --- | --- |
| `slug` | yes | The workspace slug to check |

Available:

```json
{ "available": true }
```

Unavailable:

```json
{ "available": false, "reason": "That workspace ID is already taken." }
```

`reason` is a sentence you can show as is: missing, invalid (with the rule it
broke), reserved, or taken.

## Related pages

- [GET /api/v1/me](/api-reference/me): your username and workspace slug
- [Workspaces API](/api-reference/workspaces): changing a workspace slug
- [Onboarding and profile](/api-reference/onboarding-and-profile): choosing and renaming a username
