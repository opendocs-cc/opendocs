---
title: Projects
description: Group related documents inside a workspace, one project per client, product or initiative. Your agent files each document in the right project, and the URL shows where it lives.
---

# Projects

A project groups documents that belong together inside a workspace, the way a
branch keeps a body of work apart in a repo: one per client, product, team or
initiative. Every workspace has a **Default** project for one-off documents. If you
never create another, the workspace works as a single library.

> **Ask your agent**
>
> "Start a project for the Northwind engagement and put the proposal in it."
>
> "What's in the Investors project?"
>
> "Move last year's board notes to Archive."

## What happens

- **The URL shows the project.** Default-project documents sit right under the
  workspace; documents in a named project carry its slug:

  ```text
  https://opendocs.cc/halvard/onboarding-checklist
  https://opendocs.cc/halvard/projects/investors/q3-investor-update
  ```

  Each project also has its own page, `opendocs.cc/halvard/projects/investors`, and
  tag pages are scoped the same way (`opendocs.cc/halvard/tag/finance`,
  `opendocs.cc/halvard/projects/investors/tag/finance`).
- **Your agent keeps things organized.** Before publishing, it checks which
  project a document would land in and what each project holds. When you change
  topic, it files the document in the matching project or suggests a new one.
  One-off documents stay in Default.
- **Moving changes the link.** A document moved to another project gets that
  project's URL, and the old link stops working. Move before you share. Moving
  never changes the content or the version history.
- **Tags work inside projects.** Use a project for the body of work and tags for
  smaller labels in it: an Investors project with documents tagged `board`,
  `fundraising` and `finance`.

Any member can create a project. Owners and admins can rename or delete one; a
project must be empty to be deleted, and Default can't be renamed or deleted.
Moving a document is for its author, owners and admins.

### How proactive your agent is

The `organize` preference tells your agent how much to decide on its own. Say
"create projects without asking" or "stop sorting my documents" and it changes it:

```bash
opendocs config set organize ask    # default: suggest new projects, ask first
opendocs config set organize auto   # create and pick projects without asking, then say where things went
opendocs config set organize off    # always use the active project
```

## Under the hood

### Which project a new document goes to

For each file it hasn't published before, the CLI picks the first of:

1. `--project <name>` on the command (created if the name is new).
2. The file's place in a cloned workspace: files under `projects/<slug>/` go to
   that project.
3. The folder's linked project (`opendocs project link`).
4. The CLI's active project (`opendocs project use`), Default to begin with.

The publish result reports it as `projectSource`: `flag`, `path`, `folder` or
`active`.

### Commands

```bash
opendocs project list                       # projects, document counts and recent titles
opendocs project current                    # where this folder publishes, and why
opendocs project create "Northwind" --slug northwind --use
opendocs project use investors              # switch the active project
opendocs project use default                # back to Default
opendocs project rename investors --name "Investor relations" --slug investor-relations
opendocs project delete old-drafts --yes    # empty, non-default projects only
```

`--name` is required for `rename`. Changing a project's slug changes the URL of
every document in it.

Link a folder to a project, so new documents published from it go there:

```bash
opendocs project link "Northwind"   # created if the name is new
opendocs publish ./proposal         # → Northwind
opendocs project unlink
```

`opendocs clone --project <slug>` links the cloned folder for you.

Publish to a project without switching, move a document, or work with one project:

```bash
opendocs publish proposal.md --project Northwind
opendocs move board-notes-2025 --project Archive          # created if new
opendocs list --project investors
opendocs list --all-projects
opendocs pull --project investors --output ./investors
opendocs export --project investors -f pdf                # into ./investors-pdf/
```

`opendocs move` reports the new URL. If the slug is taken in the target project,
the document gets a suffix and the CLI says so. Re-publishing a file this folder
already published with `--project <other>` also moves it.

`opendocs workspace use <slug>` switches workspace and resets the active project
to that workspace's Default.

The project endpoints are in the [Projects API](../api-reference/projects.md).

## Related pages

- [Publish a document](./publish.md)
- [Find, download and remove](./list-get-pull-unpublish.md)
- [Sync a folder](./sync-and-history.md)
- [Workspaces and teams](../visibility/workspaces-and-team-access.md)
