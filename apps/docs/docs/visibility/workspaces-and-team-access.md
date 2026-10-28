---
title: Workspaces and teams
description: A workspace is your team's shared space for documents. Invite people, give them roles, let colleagues join by email domain, and see who can edit or manage each document.
---

# Workspaces and teams

A workspace is where your team's documents live, at `opendocs.cc/<workspace>`.
Everyone in it can read and edit the workspace's documents, and owners and admins
look after people and settings. Your first workspace is created when you sign up.

> **Ask your agent**
>
> "Invite Sam to our workspace as an admin."
>
> "Let anyone with a halvard.example email join the workspace."
>
> "Who's in the workspace, and are any invitations still pending?"

## What happens

- **Invitations need a yes.** Inviting someone sends an email they accept, so
  nobody is added without confirming. Pending invitations count toward the
  workspace's member limit.
- **Colleagues can join on their own.** With a company domain set up for auto-join,
  anyone who signs in with a verified address at that domain can join as a member.
- **Members see the team's documents.** Every document with `workspace` (or
  `public`) visibility is open to every active member. `private` documents stay
  with their author.
- **The workspace holds the settings** that apply to everyone's documents: whether
  public documents are allowed, the export theme, the Google Drive and
  e-signature integrations, and on Pro and Team a
  [custom domain](../publishing/custom-domains.md) such as `notes.halvard.example`.

You can belong to several workspaces and switch between them. Member limits are 3
per workspace on Free, 5 on Pro and unlimited on Team; see
[Plans and limits](../getting-started/plans-and-limits.md).

## Who can do what

Every workspace has one owner. Other people are admins or members.

| | Member | Admin | Owner |
| --- | --- | --- | --- |
| Read `workspace` and `public` documents | Yes | Yes | Yes |
| Read a `private` document | Own only | Own only | Own only |
| Publish documents and create projects | Yes | Yes | Yes |
| Edit any document: update, change tags, restore a version | Yes | Yes | Yes |
| Export any document they can read, one or several at once | Yes | Yes | Yes |
| Manage a document: visibility, move, share, unpublish, delete | Own only | Any | Any |
| Rename or delete projects | No | Yes | Yes |
| Invite people, set roles, remove members, set auto-join domains | No | Yes | Yes |
| Change the export theme (the footer needs Pro or Team) | No | Yes | Yes |
| Connect or remove the custom domain (Pro and Team) | No | Yes | Yes |
| Turn on **Allow public posts**, set the default sort | No | No | Yes |

- Admins can make a member an admin. Only the owner can demote or remove an admin.
  The owner's role can't be changed, and the owner can't leave the workspace.
- The version history records who made each edit, so open editing stays
  accountable. See [Updates and versions](../publishing/update-and-version-history.md).
- Who can use Google Drive and e-signatures is a workspace setting: every member by
  default, or admins only. See [Google Drive](../integrations/google-drive.md) and
  [E-signatures](../integrations/docuseal.md).
- The rules are the same in the dashboard, the CLI and the API. A change your role
  doesn't allow is refused with `forbidden`. In the dashboard, the owner-only
  switches are shown disabled for everyone else.
- Roles work on every plan.

## Under the hood

### Team

```bash
opendocs team list                               # members, pending invitations, auto-join domains
opendocs team invite sam@halvard.example --role admin
opendocs team resend sam@halvard.example
opendocs team revoke sam@halvard.example         # cancel a pending invitation
opendocs team role sam@halvard.example member
opendocs team remove sam@halvard.example --yes
opendocs team auto-join add halvard.example
opendocs team auto-join remove halvard.example
```

- `--role` is `member` (default) or `admin`. `opendocs invite <emails...>` is a
  shortcut for `team invite`.
- `team remove` and `team leave` need `--yes` outside a terminal.
- Auto-join takes only the domain of your own verified email, and refuses consumer
  mail providers such as gmail.com and outlook.com.

The person invited accepts from the email, or from their own agent once signed in
with that address (`opendocs login` mentions pending invitations):

```bash
opendocs team invitations                # invitations, and workspaces your email domain can join
opendocs team join halvard               # accept and switch to it
opendocs team join halvard --no-switch
opendocs team decline halvard
opendocs team leave --yes
```

Accepting from the CLI and auto-join need a verified email; signing in with an
emailed code, Google or GitHub verifies it.

The endpoints are in the [Team and invitations API](../api-reference/team-and-invitations.md):
`POST /api/v1/workspace/team/invite`,
`PATCH /api/v1/workspace/team/members/:memberId/role`,
`DELETE /api/v1/workspace/team/members/:memberId`, and the invitation resend and
cancel routes.

### Workspaces

```bash
opendocs workspace list                  # every workspace you belong to
opendocs workspace use halvard           # switch; the active project resets to Default
opendocs workspace create "Halvard Labs" --slug halvard-labs
opendocs workspace members
```

`workspace create` switches to the new workspace unless you pass `--no-switch`.

### Workspace slugs and usernames

Document URLs use the workspace slug (`opendocs.cc/halvard/...`); your personal
profile uses your username (`opendocs.cc/@dana`). Changing a workspace slug breaks
every existing link to its documents, because old slugs don't redirect. See
[Usernames and workspace slugs](../api-reference/usernames.md) and the
[Workspaces API](../api-reference/workspaces.md). A
[custom domain](../publishing/custom-domains.md) keeps working through a slug
change, because it's tied to the workspace rather than its slug.

## Related pages

- [Who can see a document](./overview.md)
- [Share with people](./sharing-and-anonymous-links.md)
- [Custom domains](../publishing/custom-domains.md)
- [Plans and limits](../getting-started/plans-and-limits.md)
