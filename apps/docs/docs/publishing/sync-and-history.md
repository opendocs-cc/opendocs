---
title: Sync a folder
description: Keep a folder of Markdown in step with OpenDocs. Re-publish without duplicates, download a workspace or project to edit locally, see what changed, and handle edits that clash with a teammate's.
---

# Sync a folder

Your agent works from a folder of Markdown files. OpenDocs remembers which file is
which document, so publishing again updates documents instead of creating copies,
and you can download a whole workspace or project, edit it locally and publish the
changes back.

> **Ask your agent**
>
> "Download the Handbook project so I can edit it here."
>
> "What's changed in the handbook since we last published?"
>
> "Publish my edits to the handbook."

## What happens

- **Publishing again updates.** The first publish of `notes.md` creates
  `opendocs.cc/halvard/notes`; the next one adds a version at the same link. A file
  that hasn't changed is reported as unchanged and gets no new version.
- **A downloaded copy stays linked.** Files your agent downloads with `clone` are
  tied to their documents, so publishing the folder updates them, and new files
  become new documents.
- **You can see what's out of step.** Your agent can list which files you changed,
  which changed online, and which are new.
- **Clashing edits stop.** If someone published a newer version since your copy,
  that file isn't published; your agent tells you and asks which version to keep.

## Under the hood

### How the CLI remembers files

The CLI records each published file in `.opendocs/state.json`, in the current
folder or the nearest parent folder that has one. It holds the post ID, the
version your copy is based on and a hash of the file.

```bash
opendocs publish notes.md   # v1, opendocs.cc/halvard/notes
# ...edit notes.md...
opendocs publish notes.md   # v2, same URL
```

- `--new` creates a new document even for a file the folder already published.
- `.opendocs/` gets its own `.gitignore`, because it can hold claim tokens for
  anonymous documents.
- Re-publishing a tracked file with `--project <other>` moves the document to that
  project (author, owners and admins only).
- `opendocs update --post-id` doesn't read or write this file. See
  [Updates and versions](./update-and-version-history.md#two-ways-to-update).

### Clone a workspace or project

```bash
opendocs clone                          # the whole workspace into ./halvard/
opendocs clone handbook --project handbook
cd handbook
opendocs status                         # what changed locally or online
opendocs publish .                      # publish every change; new files become new documents
```

| Flag | Meaning |
| --- | --- |
| `[dir]` | Target folder. Defaults to the workspace slug, or the project slug with `--project`. |
| `--project <slug>` | Clone one project and link the folder to it. |
| `--tag <tag>` | Only documents with this tag. |
| `--overwrite` | Replace files that already exist in the target folder. |

A workspace clone puts Default-project documents at the root and every other
project under `projects/<slug>/`. New files you add under `projects/<slug>/`
publish to that project.

### Status

`opendocs status` compares every tracked file with the live documents and lists
untracked `.md` files too:

| Shown as | `status` in `--json` | Meaning |
| --- | --- | --- |
| up to date | `up-to-date` | Nothing changed. |
| modified locally | `modified` | You edited it. `opendocs publish .` sends it. |
| newer version online | `behind` | Someone published since your copy. |
| changed locally and online | `conflict` | Both. Publishing it will stop with `version_conflict`. |
| new (not published) | `untracked` | A new file. Publishing creates a document. |
| file deleted locally | `missing-locally` | The document is still online. |
| no longer online | `gone-remotely` | It was unpublished or deleted. |
| anonymous | `anonymous` | A 24-hour anonymous link from this folder. |

### Conflicts

Every update from a tracked file sends the version it was based on
(`baseVersionNumber`). If the live document has moved past it, the API answers
`409 version_conflict` with `currentVersionNumber`, and the CLI leaves that file
alone and carries on with the rest.

```bash
opendocs pull notes.md --stdout          # read the live version
opendocs pull notes.md -o notes.md       # take theirs (your file is replaced)
opendocs publish notes.md --force        # keep yours as the newest version
```

Pulling the latest version into a tracked file brings it back in step, so the next
publish goes through. `--force` skips the check; the teammate's version stays in the
history either way.

### History

Version history and rollback work on tracked files by name:
`opendocs history notes.md`, `opendocs rollback notes.md 2`. See
[Updates and versions](./update-and-version-history.md#version-history-and-rollback).

## Related pages

- [Updates and versions](./update-and-version-history.md)
- [Projects](./projects.md)
- [Find, download and remove](./list-get-pull-unpublish.md)
