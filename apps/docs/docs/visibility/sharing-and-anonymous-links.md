---
title: Share with people
description: Share one document with specific email addresses or a whole company domain without adding anyone to your workspace, or publish a 24-hour link without an account.
---

# Share with people

Share a document with one person, or everyone at a company, without adding them to
your workspace or making the document public. It's the right way to send a
proposal to a client, a report to investors or a brief to a contractor.

> **Ask your agent**
>
> "Share the Northwind proposal with ines@northwind.example."
>
> "Let anyone at northwind.example read the proposal."
>
> "Who has access to the Q3 investor update?"

## What happens

- **People you name get an email** with the link. Your agent can skip the email if
  you'd rather send the link yourself.
- **They sign in with that address to read it.** OpenDocs checks the address is
  theirs with an emailed code (signing in with Google or GitHub also counts). No
  password, no workspace to join.
- **They see only what you shared.** Guests can read the shared documents and
  nothing else in the workspace, and they don't take up a member seat.
- **A domain lets in the whole company.** Sharing with `northwind.example` lets
  anyone with a verified address there read the document. Use a company's own
  domain, never a public mail provider such as `gmail.com`.
- **It works at any visibility.** A `private` document shared with Ines stays
  hidden from your workspace but opens for her.
- **Private notes stay out.** Guests don't see
  [`private` blocks](../publishing/rendering-and-metadata.md#private-blocks), on
  the page or in the Markdown they download.
- **You can see and undo it.** Ask who has access, or to stop sharing with someone.

Sharing is for the document's author, owners and admins.

## Anonymous links

Without an account, your agent can still publish a link that works for 24 hours,
for example on the first try before you sign up. Your agent asks before doing this,
because anyone with the link can read it.

> **Ask your agent**
>
> "Give me a link to these meeting notes without signing up."

- **Anyone with the link can read it for 24 hours.** Then it's deleted.
- **You also get a claim link.** Open it and sign in, and the document moves into
  your workspace as a normal document with `workspace` visibility and a link in
  your workspace. The anonymous link stops working.
- **Signing up from the same folder keeps it automatically.** When your agent runs
  `opendocs login --email <you>` in the folder it published from, the anonymous
  documents are claimed into your new workspace.
- **Limits:** up to 512 KB of Markdown per document, no image uploads, and a banner
  saying it was shared anonymously. Anonymous pages aren't indexed by search
  engines or listed anywhere.

## Under the hood

### Sharing

```bash
opendocs share northwind-proposal ines@northwind.example       # emails Ines a link
opendocs share northwind-proposal @northwind.example --no-notify
opendocs share northwind-proposal                              # list who has access
opendocs share northwind-proposal ines@northwind.example --remove
```

- `<doc>` is a post ID, a slug, or a local `.md` file this folder published.
- People are emails or domains, space- or comma-separated. `@northwind.example` and
  `northwind.example` both mean the domain.
- `--no-notify` skips the email. Domains are never emailed.
- Up to 50 emails and 20 domains per request.
- The result has the `url` to send, the `emails` and `domains` with access, and
  `notified`, the addresses that were emailed.

The endpoints are `GET`, `POST` and `DELETE /api/v1/posts/:postId/share`, with a
body of `{ "emails": [...], "domains": [...] }` (plus `"notify": false` on `POST` to
skip emails). See
[Agent endpoints](../api-reference/agent-endpoints.md#sharing-with-people-outside-the-workspace).

### Anonymous publishing

```bash
opendocs publish meeting-notes.md --anonymous --json
```

```json
{
  "anonymous": true,
  "total": 1,
  "succeeded": 1,
  "failed": 0,
  "results": [
    {
      "file": "meeting-notes.md",
      "success": true,
      "action": "created",
      "url": "https://opendocs.cc/a/...",
      "claimUrl": "https://opendocs.cc/claim/...",
      "expiresAt": "2026-10-26T10:12:00.000Z"
    }
  ]
}
```

- Give the person the `claimUrl` exactly as returned.
- Up to 10 files per run. `--visibility`, `--tags`, `--project` and `--export` are
  ignored. Local images aren't uploaded.
- Publishing the same file again with `--anonymous` updates the same link without
  extending the 24 hours.
- The claim token is kept in `.opendocs/state.json`, which is why that folder is
  git-ignored.
- `opendocs claim` claims everything this folder published anonymously into the
  active workspace and project; `opendocs claim <claim URL>` claims one.
  `--visibility private` keeps it to yourself. Claimed documents count toward the
  Free plan's 50.
- Anonymous publishing is limited to 20 documents an hour and 50 a day per IP
  address.
- Readers can report an anonymous page. Once readers at 3 different addresses
  have reported it, it's hidden until we've reviewed it.

The endpoints are under
[Anonymous documents](../api-reference/agent-endpoints.md#anonymous-documents-no-api-key).

## Related pages

- [Who can see a document](./overview.md)
- [Public documents](./public-sharing.md)
- [Workspaces and teams](./workspaces-and-team-access.md)
