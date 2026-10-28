---
title: Agent cookbook
sidebar_position: 1
description: Step-by-step OpenDocs recipes for agents and agent builders, covering sign-up, publish and export, folder sync, projects, versions, sharing, teams, branding, Google Drive, signatures, errors and rate limits.
---

# Agent cookbook

These are the recipes an agent follows when someone asks for something in
OpenDocs, with the exact commands for CLI 0.4.7. If you're a person, you don't
need this page: ask your agent, and see
[What to ask your agent](../getting-started/what-to-ask.md) for ideas. If
you're building an agent or tool, this is the behavior to copy.

"You" below is the agent. "The person" is whoever you're working for.

## Before you start

- **Install and sign in.** The CLI is `npm install -g @opendocs.cc/cli`
  (Node.js 20+). Without Node.js, run
  `curl -fsSL https://opendocs.cc/install.sh | bash` and use
  `bash ~/.claude/skills/opendocs/scripts/opendocs.sh` in place of `opendocs`;
  it covers sign-in, publish, list, pull, history, share, export, team invites
  and the theme, but not Drive, signatures or `--export` on publish.
- **Pass `--json` on every command.** stdout is one JSON object. Errors go to
  stderr as `{ "error", "message", "docs_url" }` with a non-zero exit.
- **`<doc>` is a post ID, a slug, or a local `.md` file this folder
  published.**
- **Links.** API `url` fields are paths such as `/halvard/q3-investor-update`;
  prepend `https://opendocs.cc`. Put each link on its own line with nothing
  after it.
- **Say who can open it**: workspace members (the default), only them
  (private), the people it's shared with, anyone (public), or anyone with the
  link for 24 hours (anonymous).
- **Check before anything that reaches other people or is hard to undo**:
  public visibility, invitations, theme changes, signature requests, deletes.

## Sign the person up

When there's no saved login (any command, `opendocs whoami --json` included,
fails with `not_logged_in`), ask for their email and sign them up. It's free for up to 50
documents and needs no browser.

```bash
opendocs login --email dana@halvard.example --json
# → {"status": "code_sent", ...}. Ask: "Check your inbox for a code from OpenDocs and paste it here."
opendocs login --email dana@halvard.example --code 482913 --json
```

A new email gets an account, a workspace at `opendocs.cc/<username>`, a Default
project and an API key named after you, saved to
`~/.config/opendocs/config.json`. Codes expire after 10 minutes and allow 5
tries: on `invalid_code` ask for the newest email, on `code_expired` send a new
one. Never run bare `opendocs login`; it waits for a key on stdin. If login
returns `pendingInvitations`, ask before joining any of them.

## Publish without an account

Only when the person doesn't want an account yet and agrees that anyone with
the link can read it:

```bash
opendocs publish notes.md --anonymous --json   # url, claimUrl, expiresAt
```

Give them the `url` and the `claimUrl` exactly as returned, say it expires in
24 hours, and offer to sign them up. Logging in later from the same folder
keeps the document (or run `opendocs claim`). Anonymous publishing allows 30
documents an hour and 100 a day per IP, 10 files per run and 512 KB per file.

## Publish a document and send a PDF

"Publish the Q3 investor update to the Investors project and send me the PDF."

```bash
opendocs project list --json
opendocs publish q3-investor-update.md --project investors --export pdf --json
```

The result has the `url` and `export.path`, the PDF written next to the source
file. Tell them both. PDF works on every plan, with the workspace's export
theme; Free PDFs carry a "Made with OpenDocs" footer. Word (`--export docx`) needs Pro or
Team. If the publish succeeds and the export fails, the document stays up;
retry only the export:

```bash
opendocs export q3-investor-update --format pdf --json
```

`opendocs export` writes a PDF unless you pass `--format docx` (Pro and Team).

## Publish a folder

"Upload all the board pack docs." One command, never a loop:

```bash
opendocs publish ./board-pack --tags q3-board --json
opendocs publish ./board-pack --tags q3-board --export pdf --json   # with PDFs
```

- Folders are recursive and skip `.obsidian`, `.trash`, `.git`, `.hg`,
  `.opendocs` and `node_modules`.
- The CLI sends 25 documents per request and takes up to 500 files per run;
  each file can be up to 1 MB.
- The result has `total`, `succeeded`, `failed` and `results[]` (plus
  `export.results[]` with each PDF's `path`). A run with some failures still
  exits 0: check `failed` and retry only those files.
- The shared tag is how the person finds the group later:
  `opendocs list --tag q3-board --json`.

## Re-export a folder after edits

"I've fixed the numbers, send me fresh PDFs." Run the same command again from
the same folder:

```bash
opendocs publish ./board-pack --export pdf --json
```

In CLI 0.4.6 this updates the files that changed (`updated[]` with
`action: "updated"`), leaves the rest alone (`"unchanged"`, no new version) and
writes a fresh PDF for every file in the folder. Report the new version numbers
and the PDF paths.

## Keep a folder in sync

The CLI records what each folder published in `.opendocs/state.json`, so
publishing a file again updates the same document. To work on what's already
online:

```bash
opendocs clone --json                      # whole workspace into ./<workspace>
opendocs clone board-pack --project board --json
opendocs status --json                     # up-to-date, modified, behind, conflict, untracked
opendocs pull board-pack/agenda.md -o board-pack/agenda.md   # bring a "behind" file up to date
opendocs publish . --json                  # publish every change; new files become new docs
```

On `version_conflict` (someone published since your last sync), stop. Show the
person, compare with `opendocs pull <doc> --stdout`, and re-run with `--force`
only if they want their copy to win. Don't commit `.opendocs/`; the CLI
git-ignores it because it holds claim tokens.

## Update a document this folder didn't publish

If the person names a document published elsewhere, use its slug:

```bash
opendocs list --json --limit 20            # if you're not sure which one
opendocs pull q3-investor-update --stdout > q3-investor-update.md
# edit the file
opendocs update q3-investor-update.md --post-id q3-investor-update --json
```

`update` adds a version and keeps the link. Omitted `--visibility` and
`--tags` keep their current values. It has no `--export`; run
`opendocs export` afterwards. Any active workspace member can update any
document in the workspace, and the version history records who did.

## Put documents in the right project

Projects work like branches in a repository: one per client, product or
initiative. Before publishing, know where the document will go:

```bash
opendocs whoami --json            # organize: ask | auto | off, and folderProject
opendocs project current --json   # where the next publish goes, and why
opendocs project list --json      # names, document counts, recentTitles
```

- An existing project clearly fits: publish with `--project <slug>` and say
  where it went.
- A new, ongoing topic: with `organize: ask` (the default), ask once ("Want me
  to start a Brightwater project for this?"). With `auto`, create it and say
  so. With `off`, use the active project.
- A folder or repository dedicated to one topic: `opendocs project link "Brightwater"`
  once, and every new file published from there goes to that project.
- A one-off note: the active or Default project is fine.

```bash
opendocs publish proposal.md --project "Brightwater" --json   # a new name creates the project
opendocs move old-proposal --project archive --json           # the URL changes; ask first
opendocs config set organize auto --json                      # when the person says "stop asking"
```

Default-project URLs are `opendocs.cc/<workspace>/<slug>`; project URLs are
`opendocs.cc/<workspace>/projects/<project>/<slug>`.

## Switch workspace before publishing

When the person names a workspace, check it's the active one:

```bash
opendocs workspace list --json             # match their words to name or slug
opendocs workspace use halvard-board --json   # only if activeSlug differs
```

Switching only changes the CLI's local config and resets the active project to
that workspace's Default. If the workspace isn't listed (`not_a_member`), tell
them which ones are.

## Versions and rollback

"What changed in the investor update?" or "Go back to Tuesday's version."

```bash
opendocs history q3-investor-update --json             # newest first, who and which agent published
opendocs pull q3-investor-update --version 3 --stdout  # read an old version
opendocs rollback q3-investor-update 3 --json          # publish v3 again as a new version
```

Rollback never deletes history, so it can itself be undone. Tell them the new
version number.

## Choose visibility safely

```bash
opendocs publish plan.md --json                                    # workspace (default)
opendocs publish salary-bands.md --visibility private --json       # only them
opendocs visibility launch-faq public --confirm-public --json      # anyone with the link
```

"Share with the team" means keep `workspace`. Use `public` only when the
person explicitly asks for a public link, and say anyone with it can read the
document. Public also needs the workspace's **Allow public documents** setting.
Changing visibility, moving, sharing, unpublishing and deleting are for the
document's author and the workspace's owners and admins.

## Share with specific people

Prefer this to making a document public when the person wants to send it to a
client, investor or contractor:

```bash
opendocs share q3-investor-update.md sam@halvard.example --json        # emails Sam a link
opendocs share q3-investor-update.md @brightwater.example --no-notify --json
opendocs share q3-investor-update.md --json                            # who has access
opendocs share q3-investor-update.md sam@halvard.example --remove --json
```

Guests verify their email with a code and can read only that document; they
don't join the workspace.

## Invite teammates

"Add Sam to the workspace." Confirm the exact email and the role (`member`
unless they say admin), because it sends an email:

```bash
opendocs team invite sam@halvard.example --json
opendocs team invite sam@halvard.example --role admin --json
opendocs team list --json            # members, pending invitations, auto-join domains
```

Tell them Sam has to accept the email. `team remove` and `team leave` need
`--yes`, passed only after the person confirms. Free workspaces have 3 members
and Pro workspaces 5; `member_limit` means an owner needs to upgrade.

## Change the export theme (ask first)

The theme (preset, brand color, font, logo, footer) changes every PDF and Word
file in the workspace. It's Pro and Team only, and only owners and admins can
change it. Propose, wait for a yes, then apply:

```bash
opendocs theme --json                    # current theme and canEdit
opendocs theme presets --json            # classic, boardroom, editorial, research, studio,
                                         # field-guide, letterpress, terminal, launch
opendocs theme check "#13294B" --json    # contrast check, changes nothing
opendocs theme set --preset boardroom --yes --json
opendocs theme set --color "#13294B" --font "IBM Plex Sans" --yes --json
opendocs theme logo ./halvard-logo.png --yes --json
opendocs theme set --logo-in-exports on --yes --json
opendocs theme footer --company "Halvard" --tagline "Investor relations" --link-url halvard.example --yes --json
opendocs export q3-investor-update --format pdf --json   # preview for the person
```

The brand color must be dark: at least 4.5:1 against white, or the API refuses
it with `low_contrast`. Use the deepest shade of the brand's hue. Without
`--yes` outside a terminal these commands stop with `confirm_required`;
`plan_required` means the workspace is on Free, `forbidden` means the person
isn't an owner or admin.

## Save to Google Drive

Pro and Team, once an owner or admin has connected Drive and named the folders
in the dashboard's **Integrations** tab. Only save when the person asks.

```bash
opendocs integrations --json             # integrations[].destinations[].name, settings, dashboardUrl
opendocs save q3-investor-update.md --folder "Investor updates" --json         # PDF
opendocs save board-minutes-oct --folder "Board Minutes" --format docx --version 3 --json
```

Use a folder name exactly as `opendocs integrations` lists it. If their words
match none or several, ask. Give them `file.url` on its own line;
`file.verified: true` means Drive's checksum matches what OpenDocs rendered.
See [Google Drive](../integrations/google-drive.md).

## Request signatures

Pro and Team, with DocuSeal connected. Signing is always two steps, never one.

1. **Draft.** Use only names and emails the person gave you or the document
   states; ask for anything missing. Nothing is emailed yet.

   ```bash
   opendocs sign request offer-letter.md \
     --signer "Employee=Priya Natarajan <priya.natarajan@fastmail.example>" \
     --signer "Company=Dana Whitfield <dana@halvard.example>" \
     --subject "Please sign: Offer letter" \
     --expires 2026-11-30 --file-to "Signed agreements" --json
   ```

2. **Confirm.** Read back the summary: document and version, each signer and
   email with their role, the order (one after another, or all at once with
   `--parallel`), subject, expiry, where the signed copy is filed, and any
   `warnings`. Offer the exact PDF they'll receive:

   ```bash
   opendocs sign download <id> --kind draft
   ```

3. **Send** only after an explicit yes. "Looks fine?" or silence is not a yes.

   ```bash
   opendocs sign send <id> --yes --json
   ```

If `confirmation.mode` is `browser`, your API key can't send
(`approval_required`): give them `confirmation.approveUrl` on its own line and
ask them to click Send there. If they change anything, cancel the draft
(`opendocs sign cancel <id> --yes`) and request a new one. Later:

```bash
opendocs sign status <id> --json          # draft, pending, completed, declined, expired, cancelled, failed
opendocs sign download <id>               # signed PDF; --kind audit for the certificate
opendocs sign save <id> --folder "Signed agreements" --json
```

Check status when asked; don't poll in a loop. A `signature` fenced block in the
document marks where each role signs. See
[E-signatures with DocuSeal](../integrations/docuseal.md).

## Handle errors

Read `error` and quote `message` to the person; it says what to do next.

| Error | What to do |
| --- | --- |
| `not_logged_in` | Sign them up (above). |
| `invalid_code`, `code_expired`, `too_many_attempts` | Ask for the newest code, or send a new one. |
| `version_conflict` | Stop and show them. `--force` only with their OK. |
| `document_limit` | Free plan's 50 published documents are used. Don't retry; see below. |
| `plan_required` | A custom export footer and integrations need Pro or Team (Word export returns `docx_requires_pro`). The rest of the theme works on Free. Offer the upgrade. |
| `confirm_required` | You ran a command that needs `--yes`. Ask first. |
| `confirm_public_required` | Public needs `--confirm-public` and their explicit OK. |
| `forbidden` | Their role can't do this; an owner or admin can. |
| `integration_not_connected`, `reconnect_required` | An owner or admin connects Drive or DocuSeal in the dashboard (`dashboardUrl`). |
| `destination_not_found` | Pick a folder from `destinations` with the person. Never guess. |
| `signer_roles_mismatch`, `invalid_signers` | Ask who signs for each role; fix the `--signer` values. |
| `too_many_files`, `too_many_posts` | Split into runs of 500 files, or exports of 10. |
| `export_failed` | Retry the export; the document is still up. |
| `rate_limited` | See below. |

The full list is in [Errors](../errors.md).

## Rate limits and big jobs

Limits are per account for signed-in requests and per IP otherwise, per minute:
600 requests per IP overall, 120 publishes, 20 batch publishes (25 documents
each), 120 exports, 30 batch exports (10 documents each), and at most 4 exports
running at once per account. Anonymous publishing allows 30 an hour and 100 a day
per IP.

The CLI (0.4.6+) handles a `429` for you: it waits the `Retry-After` time and
retries, up to 5 times for waits of up to 90 seconds, so a large publish slows
down instead of failing. Longer waits (the hourly anonymous limit, sign-in
codes) come straight back as `rate_limited`; tell the person when to try again.
Don't add your own retry loops and don't run exports in parallel. One
`publish --export` or `export --project` call handles a whole folder or
project. If you call the API directly, honor `Retry-After` yourself.

## When the Free document limit is reached

`document_limit` won't change on retry. Unpublished documents don't count
toward the 50, so offer:

- publishing only the files that fit (the error says how many slots are left),
- unpublishing old documents with `opendocs unpublish <slug>`, after they pick
  which,
- upgrading to Pro for unlimited documents.

## Checklist

- The content is saved to a `.md` file.
- `--json` on every command.
- The right workspace and project, checked when it matters.
- One command for a folder, with a shared tag.
- No public visibility, invitation, theme change, signature request or delete
  without the person's explicit yes.
- Each link on its own line, who can open it, and the path of any export.

## Related pages

- [The OpenDocs skill](../getting-started/skill-md.md)
- [CLI reference](../cli/reference.md)
- [Errors](../errors.md)
- [Plans and limits](../getting-started/plans-and-limits.md)
- [Set up your agent](../integrations/overview.md)
