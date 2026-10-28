---
title: Troubleshooting
description: Fixes for the problems people run into most, from setup and sign-in to missing links, export errors and limits.
---

# Troubleshooting

Most problems come with an error code and a message that says what to do; your
agent will usually relay it. If you have a code, the [error reference](../errors.md)
explains it. Otherwise, find the symptom below.

## Setup

### The skill installer ends with a PromptScript error

`npx skills add opendocs-cc/skills --skill opendocs -g -y` can end with:

```text
✗ opendocs → PromptScript: PromptScript does not support global skill installation
```

That's a known bug in the `skills` installer: with `-g` it also targets
PromptScript, which only supports per-project skills. Only that line failed. The
skill is installed for your other agents; carry on.

### My agent says `opendocs: command not found`

The skill is installed, but the CLI isn't. Ask your agent to install it:

> **Ask your agent**
>
> "Install the OpenDocs CLI and try again."

With Node.js 20 or later it runs `npm install -g @opendocs.cc/cli`. Without
Node.js, the skill's bash client (`scripts/opendocs.sh` in the skill folder) covers
the core commands; it needs `curl` and `jq`.

### My agent is stuck at sign-in

It probably ran `opendocs login` without `--email` or `--key`, which waits for
input that never comes. Stop the command and ask your agent to sign in with your
email instead: it runs `opendocs login --email <your email>` and you paste the
code.

### The sign-in code didn't arrive, or doesn't work

- Check spam, and look for an email from OpenDocs with the code in the subject.
- Codes expire after 10 minutes and allow 5 attempts. Ask your agent to send a new
  one (`invalid_code`: use the newest email; `code_expired`: request again).
- Prefer the browser? Sign up at [opendocs.cc/signup](https://opendocs.cc/signup),
  then copy the prompt from the **Connect your agent** card in the dashboard.

### Sign-in worked before, now every command fails with `auth_expired`

The API key was revoked or deleted. The CLI clears it; sign in again with your
email to get a new one. You can also create a key under **API keys** in the
dashboard and use `opendocs login --key od_live_...`.

## Links and access

### The document went to the wrong workspace or project

The CLI keeps one active workspace and project, separate from what you have open
in the dashboard.

> **Ask your agent**
>
> "Which workspace are you publishing to? Switch to Halvard and move the launch
> plan to the Product project."

Under the hood: `opendocs whoami --json`, `opendocs workspace use halvard`,
`opendocs move launch-plan --project product`.

### Someone can't open a link

- **"You don't have access":** the document is `workspace` or `private`. Add them
  to the workspace, or share just that document with their email. They sign in
  with that exact address; the email has to be verified, which signing in with a
  code does.
- **A public link shows "not found":** check that the document is still published,
  that its visibility is `public`, and that the workspace's **Allow public posts**
  setting is on (only the workspace owner can turn it on). See
  [Public documents](../visibility/public-sharing.md).

### Publishing again created a second document

OpenDocs updates a document when you publish the same file from the same folder:
the folder's `.opendocs/state.json` remembers which file is which document.
Publishing from a different folder, after deleting `.opendocs/`, or with `--new`
creates a new one. Ask your agent to update the existing document by name, or to
unpublish the duplicate.

### `version_conflict` when updating

Someone published a newer version since your copy was synced. Your agent should
show you, pull the live version to compare, and overwrite only if you say so
(`--force`). See [Sync a folder](../publishing/sync-and-history.md).

## Limits

### `document_limit`

The Free plan's 50 published documents are used. Existing documents keep working,
including updates. Unpublish documents you no longer need, publish fewer, or
upgrade to Pro. See [Plans and limits](plans-and-limits.md).

### `rate_limited`

Too many requests in a minute. The CLI (0.4.6 or later) waits for the time the
server asks and retries on its own, so large publishes and exports slow down
instead of failing. On an older CLI, ask your agent to update it
(`npm install -g @opendocs.cc/cli`). Avoid running many exports in parallel: an
account can have 4 running at once. Limits are listed in
[Plans and limits](plans-and-limits.md#rate-limits).

## Exports

### The PDF failed but the document published

Publishing and exporting are separate steps; the document is up. Ask your agent
to export it again (`opendocs export <document> --format pdf`). If exports keep
timing out (`export_timeout`, or `converter_timeout` for one document in a batch),
wait a minute and try again.

### Word export or the footer is refused

`docx_requires_pro` and `plan_required` mean the workspace is on Free: Word files,
your own export footer and integrations need Pro or Team. PDF, presets, brand
color, font and logo work on every plan.
`low_contrast` means the brand color is too light for headings and white table
text; use a darker shade of the same color. `forbidden` on a theme change means
only owners and admins can change it.

### Local images don't show up

Your agent uploads images that the Markdown references with a local path. Check
that each image exists, sits inside the Markdown file's folder, is JPEG, PNG, WebP,
GIF or SVG, and is 10 MB or smaller. Remote image URLs are used as they are.

## Integrations

Problems connecting Google Drive or DocuSeal, or with a signature request, are
covered on [Google Drive](../integrations/google-drive.md) and
[E-signatures](../integrations/docuseal.md).
