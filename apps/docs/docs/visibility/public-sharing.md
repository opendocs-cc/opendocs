---
title: Public documents
description: Make a document readable by anyone with the link, with no account needed. It takes your explicit confirmation and the workspace owner's Allow public posts setting.
---

# Public documents

A public document can be read by anyone who has the link, without an OpenDocs
account. Use it for things meant for the open web: a changelog, a public guide, a
status page. To send a document to a client or investor, sharing it with their
email is usually better. See [Share with people](./sharing-and-anonymous-links.md).

> **Ask your agent**
>
> "Make the v2.4 changelog public."
>
> "Publish the API migration guide publicly so customers can read it."

## What happens

Two things have to be true before someone outside the workspace can read a
document:

1. **The document is public.** Your agent asks you before making it public, every
   time, and the CLI and API refuse without an explicit confirmation.
2. **The workspace allows public documents.** This is the **Allow public posts**
   setting in the dashboard, under **Settings → Sharing**. It's off in new
   workspaces, and only the workspace owner can change it.

While the setting is off, a public document behaves like a `workspace` one: members
can read it and nobody else can. The dashboard marks it with an amber dot. Your
agent can't see or change the setting, so if a public link doesn't open for
people outside, check it in the dashboard.

When the setting is on:

- Public documents open for anyone with the link, at the usual address:
  `opendocs.cc/halvard/changelog-v2-4`, or
  `opendocs.cc/halvard/projects/product/changelog-v2-4` in a project.
- Your workspace page, `opendocs.cc/halvard`, becomes visible to anyone and lists
  the public documents.
- Search engines aren't blocked from public pages. Treat a public link as published
  on the web.
- On Pro and Team, public documents can live on your own domain instead, such as
  `notes.halvard.example/changelog-v2-4`, and the opendocs.cc links redirect there.
  See [Custom domains](../publishing/custom-domains.md).

Readers can also download the document's Markdown from the page, without its
`private` blocks. See [Private blocks](../publishing/rendering-and-metadata.md#private-blocks).

## Before you make something public

- Remove internal notes, or move them into `private` blocks.
- Check the title, tags and summary read well to outsiders.
- Make sure the workspace slug in the URL is the one you want. Changing it later
  breaks every link to the workspace's documents; old slugs don't redirect.

## When not to use public

These are better served by `workspace`, the default, or by sharing:

- "Share this with my team."
- "Let the other workspace members review it."
- "Send it to the Northwind team."
- "Keep it internal but linkable."

## Under the hood

```bash
opendocs publish changelog-v2-4.md --visibility public --confirm-public
opendocs visibility changelog-v2-4 public --confirm-public
opendocs update changelog-v2-4.md --post-id changelog-v2-4 --visibility public --confirm-public
```

The API takes the same confirmation in the request body:

```json
{
  "visibility": "public",
  "confirmPublic": true
}
```

- Without it, the CLI fails with `confirm_public_required` before sending
  anything. The API answers `400`: `invalid_request` from publish and update,
  `visibility_change_failed` from the visibility endpoint.
- A public document in a workspace that doesn't allow public documents is accepted,
  but nobody outside can read it until the owner turns the setting on.
- The setting is changed in the dashboard only. There's no CLI command or API-key
  endpoint for it.
- `opendocs whoami` shows the workspace slug used in URLs. See
  [Usernames and workspace slugs](../api-reference/usernames.md) for how it differs
  from your username.

## Related pages

- [Who can see a document](./overview.md)
- [Share with people](./sharing-and-anonymous-links.md)
- [Workspaces and teams](./workspaces-and-team-access.md)
- [Custom domains](../publishing/custom-domains.md)
