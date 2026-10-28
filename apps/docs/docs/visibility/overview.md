---
title: Who can see a document
description: Every document is private, workspace or public. What each level means, why workspace is the default, how to change it, and how sharing with specific people fits in.
---

# Who can see a document

Publishing a document doesn't make it public. Every document has one of three
visibility levels, and the default keeps it inside your workspace.

> **Ask your agent**
>
> "Keep the salary bands private to me."
>
> "Who can see the Q3 investor update?"
>
> "Make the v2.4 changelog public."

## The three levels

| Visibility | Who can open it | Use it for |
| --- | --- | --- |
| `workspace` (default) | Active members of the workspace | Specs, plans, runbooks, anything for the team |
| `private` | Only you, the author. Owners and admins can't open it either. | Drafts and personal notes |
| `public` | Anyone with the link, once the workspace owner allows public documents | Changelogs, public guides, anything for the open web |

On top of any level, you can share one document with specific email addresses or a
whole email domain. Those people can read that document without joining the
workspace. This is usually the right choice for clients, investors and
contractors. See [Share with people](./sharing-and-anonymous-links.md).

Comments on a document are for the people working on it: members of the
workspace can leave them, and members and the people it's shared with can read
them. Readers of a public document see the document without its comments.

## What your agent does

- **Uses `workspace` unless you say otherwise.** "For the team" needs nothing
  extra. "Just for me" makes it private.
- **Asks before anything public.** Making a document public is the one change your
  agent always confirms with you first, and the CLI and API refuse it without an
  explicit confirmation. See [Public documents](./public-sharing.md).
- **Prefers sharing over public** when you name people or a company outside the
  workspace.

Changing visibility later keeps the link and the version history; it doesn't
create a new version. The author, owners and admins can change it; see
[Who can do what](./workspaces-and-team-access.md#who-can-do-what).

## Under the hood

Set it when publishing:

```bash
opendocs publish salary-bands.md --visibility private
opendocs publish changelog.md --visibility public --confirm-public
```

Change it later, without re-uploading the Markdown:

```bash
opendocs visibility salary-bands private
opendocs visibility changelog public --confirm-public
```

- The levels are `private`, `workspace` and `public`. New documents default to
  `workspace`.
- Moving to `public` needs `--confirm-public` (CLI) or `"confirmPublic": true`
  (API). The CLI fails with `confirm_public_required` before sending anything.
- `opendocs update --visibility <level>` changes it together with the content.
  Without `--visibility`, updates keep the current level.
- Unpublished documents can't change visibility.

The endpoint is
[`POST /api/v1/posts/:postId/visibility`](../api-reference/post-mutations.md#post-apiv1postspostidvisibility).

## Related pages

- [Share with people](./sharing-and-anonymous-links.md)
- [Public documents](./public-sharing.md)
- [Workspaces and teams](./workspaces-and-team-access.md)
