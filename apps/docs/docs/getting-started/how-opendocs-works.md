---
title: How OpenDocs works
description: The model behind OpenDocs. Your agent publishes Markdown into workspaces and projects, every update is a version, and exports come from the same source.
---

# How OpenDocs works

Agents are good at writing. What they write ends up as Markdown files that are
hard to share: teammates can't open them without the repo, clients want a PDF,
and the next rewrite overwrites the last one. OpenDocs gives each of those files a
home: a link that stays the same, a branded PDF or Word file when someone needs
one, and a history of every version.

## The loop

1. You ask your agent for a document, or for something done to one.
2. Your agent writes or edits a Markdown file in your folder.
3. It runs an `opendocs` command (the skill taught it how).
4. OpenDocs stores the new version and returns a link, plus a PDF or Word file if
   you asked for one.
5. Your agent gives you the link.

The Markdown file in your folder stays the source of truth. OpenDocs keeps a
snapshot of each version you publish, so you can read and restore old ones.

## Workspaces, projects, documents

```text
workspace   halvard                    opendocs.cc/halvard
├─ project  Default                    opendocs.cc/halvard/<document>
├─ project  Investors                  opendocs.cc/halvard/projects/investors/<document>
│  ├─ document  Q3 investor update     .../projects/investors/q3-investor-update
│  │  ├─ version 3  today, via Claude Code
│  │  ├─ version 2  yesterday, via Cursor
│  │  └─ version 1  Monday, by Dana
│  └─ document  Board deck notes
└─ project  Handbook
```

- **Workspace.** Your team's space. Members can read and edit every document in it
  that isn't private. Your first workspace is created when you sign up, at
  `opendocs.cc/<username>`.
- **Project.** A group of documents for one client, product or team, the way a
  branch keeps a body of work apart in a repo. Every workspace has a Default
  project; documents there sit right under the workspace in the URL. Your agent
  files each document in the right project when you name one.
- **Document.** One Markdown file with a stable URL. The URL never changes when the
  document is updated, so links you've sent keep working.
- **Version.** Every publish of changed content is a new version, recording who
  published it and through which agent. Rolling back publishes an old version
  again as the newest one, so nothing is ever lost.

## Who can see what

Every document has one visibility:

| Visibility | Who can open it |
| --- | --- |
| `workspace` (default) | Members of the workspace |
| `private` | Only you |
| `public` | Anyone with the link, if the workspace allows public documents |

You can also share a single document with specific email addresses or a whole
email domain, without adding those people to your workspace. Your agent never
makes a document public without asking you first. See
[Who can see a document](../visibility/overview.md).

## Exports

PDF and Word files are typeset from the same Markdown by OpenDocs's converter, not
printed from a web page. They use your workspace's export theme on every plan: a
preset or your own brand color and font, and your logo. Pro and Team can also set
their own footer; Free exports end with "Made with OpenDocs". See
[PDF, Word and branding](../publishing/branded-exports.md).

## How your agent talks to OpenDocs

| Way in | What it is | Used when |
| --- | --- | --- |
| The skill | Instructions that teach your agent the commands and rules | Always; the setup prompt installs it |
| The CLI | The `opendocs` command (`npm install -g @opendocs.cc/cli`) | The agent's main tool when Node.js is available |
| Bash client | `scripts/opendocs.sh` in the skill folder, needs `curl` and `jq` | Machines without Node.js |
| REST API | `https://api.opendocs.cc` with an API key | Custom tools and backend jobs |

All four use the same account and the same API key. See
[Set up your agent](../integrations/overview.md) and the
[REST API reference](../api-reference/authentication.md).

## What renders

Documents support GitHub-flavored Markdown: tables, task lists, code with syntax
highlighting, alerts such as `> [!NOTE]`, math, images and footnotes, with heading
anchors and a table of contents. Fenced `private` blocks are left out of what
readers see. See [Markdown that renders](../publishing/rendering-and-metadata.md).
