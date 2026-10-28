---
title: Authentication
sidebar_position: 1
description: Base URL, API keys, session auth, the emailed-code sign-in flow, OAuth for the MCP server and the X-OpenDocs-Client header for the OpenDocs REST API.
---

# Authentication

This section is for developers calling the REST API directly. If you want your
agent to publish for you, you don't need any of this: follow
[the agent setup](/integrations/overview) and your agent signs you in with an
emailed code.

The API is at:

```text
https://api.opendocs.cc
```

Every route in this reference is under `/api/v1`. The machine-readable spec
is at `https://opendocs.cc/openapi.json` (see [OpenAPI spec](/api-reference/openapi)).

## Two ways to authenticate

| Scheme | Header | Used by |
| --- | --- | --- |
| API key | `Authorization: Bearer od_live_...` | Agents, the CLI, scripts, backend jobs |
| Session cookie | Set by signing in at opendocs.cc | The dashboard |

Most endpoints accept either. When a request carries both, the session wins.
Endpoints that accept only a session are marked **session only** on their
pages; an API key gets `401 unauthorized` there. Those are API key management,
account deletion, onboarding, profile edits, avatar upload, workspace
settings (`GET /workspace`, `GET /workspaces/current`, the slug check, and
rename, slug, delete, bio, public documents, default sort and the per-field
branding routes) and `GET /workspace/team/stats`.

## API keys

Keys start with `od_live_` followed by 32 hex characters:

```bash
curl https://api.opendocs.cc/api/v1/me \
  -H "Authorization: Bearer od_live_xxxxx"
```

- A key acts as you in **every** workspace you're an active member of. It is
  recorded against the workspace it was created in, and deleting that
  workspace deletes the key.
- Keys don't expire. Revoke one to stop it working.
- The full key is returned once, when it's created. Afterwards you only see
  its last four characters.

Ways to get a key: the emailed-code flow below, `opendocs login --key` with a
key from **Dashboard → API Keys**, or `POST /api/v1/api-keys` from a session
(see [API keys](/api-reference/api-keys)).

## Recommended headers

```http
Authorization: Bearer od_live_xxxxx
Content-Type: application/json
X-OpenDocs-Client: claude-code
```

`X-OpenDocs-Client` names the agent or tool making the call, optionally with a
detail after a slash: `claude-code`, `cursor`, `codex`, `cursor/finance-bot`.
It's lowercased and must match
`^[a-z0-9][a-z0-9._-]{0,31}(/[a-z0-9][a-z0-9._-]{0,30})?$`; anything else is
ignored, never rejected. It's stored on each version you publish (the
dashboard shows "via Claude Code"), on signature requests and Drive saves, and
it names the API key the emailed-code flow creates.

IDs (`postId`, `workspaceId`, `projectId`, `userId`) are UUIDs. Some examples
on these pages shorten workspace, project and user IDs to placeholders like
`ws_123`.

## Getting a key with an emailed code

Two unauthenticated calls sign a person in (or sign them up) and return an API
key. This is what `opendocs login --email` does.

```bash
curl -X POST https://api.opendocs.cc/api/v1/auth/code/request \
  -H 'content-type: application/json' \
  -d '{"email": "dana@halvard.example"}'
```

```json
{
  "success": true,
  "email": "dana@halvard.example",
  "accountExists": false,
  "expiresInSeconds": 600,
  "message": "We sent a 6-digit sign-in code to dana@halvard.example. Ask the user to paste it, then call /api/v1/auth/code/verify."
}
```

```bash
curl -X POST https://api.opendocs.cc/api/v1/auth/code/verify \
  -H 'content-type: application/json' \
  -H 'X-OpenDocs-Client: claude-code' \
  -d '{"email": "dana@halvard.example", "code": "482913"}'
```

```json
{
  "apiKey": "od_live_0000example0000example0000example",
  "keyName": "claude-code",
  "keyId": "c4e6a8b0-2d4f-4a6c-8e0b-1d3f5a7c9e2b",
  "accountCreated": true,
  "onboardingCreated": true,
  "userId": "usr_123",
  "email": "dana@halvard.example",
  "username": "dana",
  "workspace": { "id": "ws_123", "slug": "dana", "name": "Dana" },
  "defaultProject": { "id": "proj_123", "slug": "default", "name": "Default" }
}
```

| Field | Notes |
| --- | --- |
| `email` | Required on both calls. Trimmed and lowercased, max 320 characters. |
| `code` | 6 digits. Spaces and dashes are stripped, so `482 913` works. |
| `keyName` | Optional, 1 to 100 characters. Defaults to the `X-OpenDocs-Client` value, then to `CLI`. |

A new email gets an account, a username and workspace derived from the
address (`opendocs.cc/<username>`), a Default project and the key.
`onboardingCreated` is `true` when this call created the workspace.

Codes expire after 10 minutes and allow 5 wrong attempts.

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_request` | Malformed email, or the code isn't 6 digits |
| `400` | `invalid_code` | Wrong code for this email |
| `400` | `code_expired` | The code is older than 10 minutes |
| `429` | `too_many_attempts` | Five wrong codes; request a new one |
| `403` | `signups_disabled` | New signups are paused and the email has no account (request step) |
| `409` | `onboarding_incomplete` | The account exists but has no workspace yet |
| `429` | `rate_limited` | More than 5 code requests, or 20 verify attempts, per IP in 15 minutes |

## CLI browser login

```bash
opendocs login --browser
```

The CLI opens opendocs.cc, where the approval screen shows the signed-in
account and workspace. After approval the CLI receives a short-lived one-time
code on a `127.0.0.1` callback, exchanges it with its verifier, and stores a
normal `od_live_` key. The key itself never appears in a browser URL. Agents,
CI and headless machines should use the emailed code, `OPENDOCS_API_KEY` or
`opendocs login --key` instead.

## OAuth and the MCP server

Apps that connect through the [OpenDocs MCP server](/integrations/mcp)
(Claude, ChatGPT, Cursor and others) don't use API keys. They sign the person
in with OAuth 2.1: the person signs in to OpenDocs, sees which app is asking,
chooses its permissions and clicks **Allow**. MCP clients do this on their
own from the server URL.

| What | Where |
| --- | --- |
| MCP server (the OAuth resource) | `https://mcp.opendocs.cc/mcp` |
| Protected resource metadata | `https://mcp.opendocs.cc/.well-known/oauth-protected-resource/mcp` |
| Issuer | `https://opendocs.cc/api/auth` |
| Authorization server metadata | `https://opendocs.cc/.well-known/oauth-authorization-server/api/auth` |

Access tokens are issued for the MCP server, not for direct REST API calls: use
an API key for those. People see and revoke connected apps in
**Dashboard → Connected apps**, and a revoked app loses access within a minute.
The permissions and tools are listed in [MCP tools](/reference/mcp-tools).

## Endpoints that need no auth

| Endpoint | Page |
| --- | --- |
| `POST /api/v1/auth/code/request`, `POST /api/v1/auth/code/verify` | This page |
| `POST /api/v1/anonymous/publish`, `PUT /api/v1/anonymous/:id` | [Agent endpoints](/api-reference/agent-endpoints) |
| `GET /api/v1/usernames/check` | [Usernames](/api-reference/usernames) |
| `GET /api/v1/public/posts/...` raw Markdown, `GET /api/v1/public/workspaces/:slug/markdown.zip` | [Posts](/api-reference/posts) |
| `POST /api/v1/public/posts/.../export/:format`, `POST /api/v1/tools/convert/pdf\|docx` | [Exports](/api-reference/exports) |
| `POST /api/v1/integrations/docuseal/webhook/:integrationId` | [Integrations](/api-reference/integrations) (called by DocuSeal) |
| `GET /healthz`, `GET /healthz/converter` | Health checks (outside `/api/v1`) |

The public routes also accept auth, so a signed-in caller can read their own
non-public documents through them.

## Auth failures

A missing, malformed or revoked key, or an expired session:

```json
{
  "error": "unauthorized",
  "message": "Missing or invalid credentials. Sign in with `opendocs login --email <you@example.com>` or pass an API key.",
  "docs_url": "https://docs.opendocs.cc/errors#unauthorized"
}
```

Status `401`. When you're authenticated but aren't a member of the workspace,
or your role can't make the change, you get `403 forbidden` (some routes
answer `404 not_found` instead, so they don't reveal what exists).

## Rate limits

Signed-in routes count per account, everything else per IP. See
[Errors and pagination](/api-reference/errors-and-pagination#rate-limits) for
every bucket.

## Related pages

- [API keys](/api-reference/api-keys): create, list and revoke keys
- [MCP server](/integrations/mcp): connecting Claude, ChatGPT and other apps with OAuth
- [GET /api/v1/me](/api-reference/me): the standard auth check
- [Errors and pagination](/api-reference/errors-and-pagination)
