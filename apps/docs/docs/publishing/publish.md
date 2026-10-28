---
title: Publish a document
description: Ask your agent to publish a Markdown file or a whole folder. You get a link that stays the same through every update, and a PDF or Word file next to the source if you ask for one.
---

# Publish a document

Publishing turns a Markdown file into a page at a link your team can open. Use it
whenever a document your agent wrote needs to be read by someone else: a spec, a
board update, release notes, a handbook.

> **Ask your agent**
>
> "Publish the Q3 investor update to the Investors project and send me the PDF."
>
> "Publish everything in the `docs` folder and tag it onboarding."
>
> "Publish the pricing notes, but keep them private to me for now."

## What you get

- **A link that doesn't change.** A document in the Default project lives at
  `opendocs.cc/halvard/q3-investor-update`; in a named project it's
  `opendocs.cc/halvard/projects/investors/q3-investor-update`. Updates keep the
  same link. See [Projects](./projects.md).
- **Workspace visibility by default.** Members of your workspace can open it; nobody
  else can. Your agent can make a document private to you, share it with specific
  people, or (after asking you) make it public. See
  [Who can see a document](../visibility/overview.md).
- **A title and slug from the file.** The first `# Heading` becomes the title, and
  the slug in the URL is made from it.
- **Your images.** Images next to the Markdown file are uploaded with it, so the
  page shows them.
- **A PDF or Word file if you asked.** It's written next to the source file:
  `q3-investor-update.md` gets `q3-investor-update.pdf`. PDF works on every plan;
  Word needs Pro or Team. See [PDF, Word and branding](./branded-exports.md).

Publishing the same file again from the same folder updates the document instead of
creating a copy, so "publish it again" after an edit is safe. See
[Updates and versions](./update-and-version-history.md).

On Free, a workspace can have 50 published documents. Updates don't count. See
[Plans and limits](../getting-started/plans-and-limits.md).

## Under the hood

Your agent saves the Markdown first, then runs `opendocs publish` with `--json` so
it can read the result instead of parsing terminal text.

```bash
opendocs publish q3-investor-update.md --project Investors --export pdf --json
```

```json
{
  "postId": "7f3c9a52-1d4e-4b8a-9c61-2e5f8a0b3d17",
  "slug": "q3-investor-update",
  "url": "/halvard/projects/investors/q3-investor-update",
  "title": "Q3 investor update",
  "tags": [],
  "versionNumber": 1,
  "projectSlug": "investors",
  "projectName": "Investors",
  "projectSource": "flag",
  "export": {
    "format": "pdf",
    "path": "q3-investor-update.pdf",
    "bytes": 184320,
    "success": true
  }
}
```

`url` is a path on `opendocs.cc`. `projectSource` says why the document landed in
that project: `flag` (`--project`), `path` (a `projects/<slug>/` folder in a
clone), `folder` (a linked folder) or `active` (the CLI's active project).

### Flags

| Flag | Meaning |
| --- | --- |
| `--title <title>` | Override the title. Single file only. |
| `--slug <slug>` | Choose the URL slug. Single file only. |
| `--visibility <level>` | `private`, `workspace` (default) or `public`. |
| `--confirm-public` | Required with `--visibility public`. |
| `--tags <tags>` | Comma-separated tags, applied to every file. |
| `--project <name>` | Project name, slug or ID instead of the active project. A new name creates the project. |
| `--export <format>` | Also export to `pdf` or `docx` and save next to the source. |
| `--new` | Create new documents even for files this folder already published. |
| `--force` | Overwrite the live version even if someone published a newer one. See [Sync a folder](./sync-and-history.md#conflicts). |
| `--anonymous` | Publish without an account: a 24-hour link. See [Share with people](../visibility/sharing-and-anonymous-links.md#anonymous-links). |
| `--json` | Global. Machine-readable output. |
| `--api-url <url>` | Global. Use a different API host. |

The CLI sends `markdown`, `title` and `slug` (when passed), `visibility`,
`workspaceId`, `projectId`, `tags`, `sourcePath` and `confirmPublic` to
[`POST /api/v1/publish`](../api-reference/publish.md).

### Titles and slugs

- The title is the frontmatter `title` if there is one, otherwise the first
  `# Heading`. `--title` overrides both.
- Without `--slug`, the slug is made from the title.
- A slug that's taken in the project gets a numeric suffix (`launch-plan-2`).
- `tag`, `tags`, `project` and `projects` are reserved. A generated slug gets a
  suffix; an explicit `--slug` with one of them is refused with `reserved_slug`.

### Many files and folders

Pass several files, or a folder, and the CLI publishes them in batches:

```bash
opendocs publish docs/*.md --tags onboarding --json
opendocs publish ./handbook --project Handbook --json
```

- Folders are read recursively for `.md` files. `.git`, `.hg`, `.obsidian`,
  `.opendocs`, `.trash` and `node_modules` are skipped.
- Up to 500 files per run, sent to `POST /api/v1/publish/batch` in requests of 25.
  Each file can be up to 1 MB.
- `--title` and `--slug` are refused with more than one file; each file's first
  heading becomes its title. `--visibility`, `--tags` and `--confirm-public` apply
  to every file.
- A shared tag finds the group again: `opendocs list --tag onboarding`.
- One command for the whole folder is better than a loop over files: it signs in
  once, reports one summary and keeps the rate limits happy.

### Local images

Images referenced with `![alt](./charts/revenue.png)`, `<img src="...">` or
reference-style links are uploaded before the document, and the Markdown is
rewritten to point at the uploaded copies.

- JPEG, PNG, WebP, GIF and SVG, up to 10 MB each and 30 per document.
- The image must be inside the folder that holds the Markdown file (subfolders are
  fine). A path that leaves it, such as `../../private.png`, is skipped with a
  warning.
- Remote image URLs are left as they are.

### Publish and export together

```bash
opendocs publish board-report.md --export pdf --json
opendocs publish ./investors --export pdf --json
```

The CLI publishes first, then exports each document and writes it next to its
source (`investors/q3-update.md` gets `investors/q3-update.pdf`). Since CLI 0.4.6,
re-running it on a folder that's already published updates the files that changed
and exports every file, including the unchanged ones, so you get a fresh set of
PDFs after a round of edits.

If an export fails, the document is still published; the CLI prints a retry
command such as `opendocs export <postId> --format pdf`. `--export docx` needs Pro
or Team (`docx_requires_pro` otherwise). `opendocs update` has no `--export`; run
`opendocs export` after it.

### Public publishing

```bash
opendocs publish changelog.md --visibility public --confirm-public
```

Without `--confirm-public`, the CLI and the API refuse. Even then, people outside
the workspace can read it only when the workspace owner has turned on public
documents. See [Public documents](../visibility/public-sharing.md).

:::warning
Don't use `public` to share something with your team. `workspace`, the default,
already does that. Use `public` only for links anyone on the internet may read.
:::

### Plan limit

Before uploading anything, the CLI checks the workspace's remaining document slots
and refuses a run that won't fit with `document_limit`. The API enforces the same
cap.

## Related pages

- [Updates and versions](./update-and-version-history.md)
- [Sync a folder](./sync-and-history.md)
- [Markdown that renders](./rendering-and-metadata.md)
- [CLI reference](../cli/reference.md)
