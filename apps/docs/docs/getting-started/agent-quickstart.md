---
title: Agent quickstart
description: For AI agents that just set up OpenDocs. Check the sign-in, learn the defaults, publish the first document and report back the way the user expects.
---

# Agent quickstart

This page is for you, the agent. The person you're working with pasted the OpenDocs
setup prompt: you installed the skill and probably signed them in. Finish the setup
below, then ask them what they'd like to publish. The skill (`SKILL.md`) and the
[CLI reference](../cli/reference.md) have every command; this page is the short
version with the rules that matter most.

Pass `--json` to every command. Output is then one JSON object on stdout, and
errors are JSON on stderr with an `error` code and a `message` that says how to
fix it.

## 1. Check the setup

```bash
opendocs --version        # 0.4.7 or later
opendocs whoami --json    # signed in? which workspace and project? organize preference?
```

- **No `opendocs` command:** with Node.js 20 or later, run
  `npm install -g @opendocs.cc/cli`. Without Node.js, use the bash client that came
  with the skill: `bash <skill folder>/scripts/opendocs.sh` (it needs `curl` and
  `jq`, and supports the core commands).
- **Not signed in:** ask for their email, then:

  ```bash
  opendocs login --email <email> --json                 # emails a 6-digit code, exits at once
  opendocs login --email <email> --code <code> --json   # finishes; saves an API key
  ```

  A new email gets an account, a workspace at `opendocs.cc/<username>` and a
  Default project. On `invalid_code`, ask for the newest email; on `code_expired`,
  run the first command again. **Never run bare `opendocs login`**: without
  `--email` or `--key` it waits for input and your tool call hangs.
- **Several workspaces:** if they name one, run `opendocs workspace list --json`
  and `opendocs workspace use <slug>`.

## 2. Say it's ready and ask what to publish

Tell them which workspace they're in and that the Free plan covers 50 documents.
Ask what they'd like to publish. If they're unsure, offer something from the
current folder: the README, recent notes, a summary of the work you just did.

## 3. Publish

```bash
opendocs publish report.md --json
opendocs publish report.md --export pdf --json        # also writes report.pdf next to it
opendocs publish ./docs --tags "q3-review" --json      # a folder or several files: one batched call
opendocs publish proposal.md --project "Northwind" --json
```

- **Visibility defaults to `workspace`**: only members of their workspace can open
  it. That's right for "share with the team".
- **Publishing the same file again updates it**: same URL, new version. The
  folder's `.opendocs/state.json` remembers which file is which document. Don't use
  `--new` unless they want a separate copy.
- **Never loop `publish` once per file.** Pass the folder or all the files at once.
- **Exports:** `--export pdf` works on every plan; `--export docx` needs Pro or
  Team. Re-running `publish <folder> --export pdf` after edits updates what changed
  and exports every file.
- **Projects work like branches.** If the document belongs to a client, product or
  team, pass `--project`. Run `opendocs project list --json` first and reuse an
  existing project rather than creating a near-duplicate. Follow the `organize`
  preference from `whoami`: `ask` (ask before creating a project), `auto` (create
  and say so) or `off` (use the active project).

## 4. Report back

- Put the full URL on its own line: the `url` field is a path such as
  `/halvard/q3-review`, so prefix `https://opendocs.cc`.
- Say who can open it: "your workspace" (default), "only you", "the people you
  shared it with" or "anyone with the link".
- After an export, give the file path (`export.path`). After an update, say which
  version it is now. Say which project it went to if it isn't the usual one.
- If something failed, quote the error's `message`. It says what to do next.

## Ask before you do these

| Action | Why | How |
| --- | --- | --- |
| Make a document public | Anyone on the internet can read it | Ask, then `--visibility public --confirm-public` |
| Change the export theme | It changes every PDF and Word file in the workspace | Show the preset or color and font, ask, then `opendocs theme set ... --yes` |
| Send a document for signing | Real people get an email | Create the draft, show the signers, send only after a clear yes: `opendocs sign send <id> --yes` |
| Delete a document | It can't be undone | Prefer `opendocs unpublish`. Delete only when asked, with `--yes` |
| Overwrite after a `version_conflict` | Someone else published a newer version | Show it, `opendocs pull` to compare, `--force` only if they agree |
| Invite someone to the workspace | It sends an email | Confirm the exact address and role |

For "share it with the client", prefer `opendocs share <doc> client@example.com`
over making it public.

## Errors you'll meet

- `document_limit`: the Free plan's 50 documents are used. Tell them; suggest
  unpublishing old documents or upgrading. Don't retry.
- `docx_requires_pro` or `plan_required`: Word export, a custom export footer
  and integrations need Pro or Team. Offer a PDF instead, or point them to
  [billing](https://opendocs.cc/dashboard/billing).
- `rate_limited`: the CLI waits for the time the server asks and retries on its
  own. Don't add your own retry loop, and don't run exports in parallel.
- Everything else: the [error reference](../errors.md).

## Next

- [Agent cookbook](../agents/cookbook.md): recipes for folders, projects,
  versions, sharing, branding, Google Drive and signatures.
- [CLI reference](../cli/reference.md): every command and flag.
- [llms.txt](https://docs.opendocs.cc/llms.txt): every docs page as Markdown.
