---
title: API keys
sidebar_position: 2
description: List, create and revoke OpenDocs API keys from a signed-in session.
---

# API keys

Manage the `od_live_` keys that authenticate agents, the CLI and backend jobs.
See [Authentication](/api-reference/authentication) for how a key is sent.

:::info Session only
Every endpoint on this page requires a browser session cookie. An API key
can't create, list or revoke keys; it gets `401 unauthorized`.
:::

**Dashboard → API Keys** is built on these three endpoints. Agents don't need
them: the [emailed-code flow](/api-reference/authentication#getting-a-key-with-an-emailed-code)
returns a key directly.

## The key record

```json
{
  "id": "c4e6a8b0-2d4f-4a6c-8e0b-1d3f5a7c9e2b",
  "label": "claude-code",
  "keyHint": "9e2b",
  "createdAt": "2026-03-14T11:20:00.000Z",
  "lastUsedAt": "2026-04-17T09:00:00.000Z"
}
```

`keyHint` is the last four characters of the key. `lastUsedAt` is `null` until
the key is used.

## `GET /api/v1/api-keys`

Lists your keys that still work. Revoked keys are left out.

```json
{
  "keys": [
    {
      "id": "c4e6a8b0-2d4f-4a6c-8e0b-1d3f5a7c9e2b",
      "label": "claude-code",
      "keyHint": "9e2b",
      "createdAt": "2026-03-14T11:20:00.000Z",
      "lastUsedAt": "2026-04-17T09:00:00.000Z"
    },
    {
      "id": "e8a0c2b4-6d8f-4e1a-9c3b-5d7f9a1c3e5b",
      "label": "Default",
      "keyHint": "77f0",
      "createdAt": "2026-01-10T12:00:00.000Z",
      "lastUsedAt": null
    }
  ]
}
```

## `POST /api/v1/api-keys`

Creates a key.

```json
{
  "workspaceId": "ws_123",
  "name": "CI publisher"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `workspaceId` | yes | A workspace you're an active member of. The key works in all your workspaces; this is the one it's recorded against, and deleting that workspace deletes the key. |
| `name` | yes | 1 to 100 characters. Returned as `label`. |

Status `201`:

```json
{
  "id": "a1c3e5f7-9b2d-4f6a-8c0e-2b4d6f8a1c3e",
  "label": "CI publisher",
  "keyHint": "51d8",
  "plaintext": "od_live_0000example0000example0000example",
  "createdAt": "2026-04-17T10:15:00.000Z"
}
```

:::warning One-time plaintext
`plaintext` is the only time the full key is returned. Store it now. If it's
lost, revoke the key and create a new one.
:::

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_request` | `workspaceId` or `name` missing, or `name` over 100 characters |
| `401` | `unauthorized` | No session cookie (API keys don't work here) |
| `403` | `forbidden` | You aren't an active member of `workspaceId` |

### Keys OpenDocs creates for you

- **Emailed-code sign-in** (`POST /auth/code/verify`, `opendocs login --email`)
  creates a key named after `keyName`, else the `X-OpenDocs-Client` header,
  else `CLI`. Every sign-in creates a new key.
- **Dashboard onboarding** (`POST /onboarding`) creates a key named `Default`
  when it creates your first workspace. See
  [Onboarding and profile](/api-reference/onboarding-and-profile).

## `DELETE /api/v1/api-keys/:keyId`

Revokes a key.

```json
{ "success": true }
```

| Status | `error` | When |
| --- | --- | --- |
| `404` | `not_found` | No active key with that id belongs to you (including one already revoked) |

- Revocation is immediate: the next request with that key gets
  `401 unauthorized`.
- Requests that already passed auth finish, including a running
  [batch publish](/api-reference/publish#post-apiv1publishbatch) stream.
- It can't be undone. Create a new key and update the caller.

## Related pages

- [Authentication](/api-reference/authentication): sending the key
- [Onboarding and profile](/api-reference/onboarding-and-profile): the first key
- [Errors and pagination](/api-reference/errors-and-pagination): error format
