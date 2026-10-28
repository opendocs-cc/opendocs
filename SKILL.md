---
name: opendocs
description: Publish Markdown files to shareable URLs and convert them to branded PDF or DOCX files using the OpenDocs CLI. Use this skill whenever the user wants to publish, share, or export Markdown — including asks like "turn this into a shareable link", "give me a PDF of these notes", "upload all the docs in this folder", "update the post I published", or "convert this .md to Word". Also use for finding and reading the user's published documents to answer questions about them ("what does our NDA with Acme say?", "summarise the Q3 reports"), for managing published documents (listing, updating, unpublishing), for saving documents into the workspace's Google Drive folders or sending them for e-signature, for any workflow where Markdown needs to become either a URL or a formatted document file, and for connecting Claude, ChatGPT or coding tools to the OpenDocs MCP server.
---

<!-- SPDX-License-Identifier: MIT -->

# OpenDocs — Publish Markdown to Shareable URLs and PDF/DOCX

OpenDocs turns any Markdown file into a clean, readable URL — and, in the same flow, a branded PDF or Word document if the user wants a file they can share offline. You interact with it via the `opendocs` CLI.

## Quick Reference

```
opendocs login --email you@example.com       # Sign in or sign up: emails a 6-digit code
opendocs login --email you@example.com --code 123456   # Finish: saves an API key for you
opendocs login --browser                     # Human-friendly browser login
opendocs login --key od_live_xxxxx           # Existing API key
opendocs publish doc.md                      # Publish one Markdown file → get a URL
opendocs publish doc.md                      # ...again: updates the same doc (no duplicate)
opendocs publish doc.md --anonymous          # No account: a link anyone can open for 24h + claim URL
opendocs clone                               # Download the workspace into ./<workspace> to edit
opendocs status                              # What changed locally / online since last sync
opendocs history <doc>                       # Every published version
opendocs rollback <doc> <version>            # Restore a version (as a new version)
opendocs move <doc> --project "Archive"      # Move between projects
opendocs share <doc> sam@acme.com @acme.com  # Give people outside the workspace access
opendocs team invite dana@acme.com           # Invite a teammate (they accept by email)
opendocs team join                           # Accept an invitation sent to you
opendocs theme                               # Brand color, font, logo and footer used in PDF/DOCX exports
opendocs theme set --preset editorial --yes  # Change the export theme (ask your human first)
opendocs integrations                        # Google Drive / DocuSeal: what's connected, named Drive folders
opendocs save <doc> --folder "Board Minutes" # Save a PDF (or --format docx|md) into a named Drive folder
opendocs sign request <doc> --signer "Employee=John Adams <adams@company.com>"  # Draft a signature request (sends nothing)
opendocs sign send <id> --yes                # Send the draft, only after the user confirmed every signer
opendocs sign status <id>                    # Who has signed; sign list / download / save / cancel too
opendocs workspace create "Acme Research"    # New workspace
opendocs project link "Acme launch"          # Docs published from this folder go to that project
opendocs config set organize auto            # Let agents sort docs into projects without asking
opendocs claim                               # Keep anonymous docs published from this folder
opendocs publish *.md                        # Publish multiple files (auto-batched, up to 500)
opendocs publish ./vault --tags obsidian     # Publish a folder/vault recursively
opendocs publish *.md --export pdf           # Publish AND export — PDFs land next to each source
opendocs update doc.md --post-id <id|slug>   # Update an existing post (new version)
opendocs list                                # List docs in the active workspace (alias: `opendocs ls`)
opendocs list --all                          # List across every workspace you belong to
opendocs project create <name> --use         # Create/switch to a project for a related doc batch
opendocs project use <slug>                  # Switch active project
opendocs list --tag <tag>                    # Filter by tag (great for finding a batch)
opendocs search <words>                      # Find docs by title or summary in every project
opendocs get <id|slug>                       # View post details
opendocs pull <id|slug>                      # Download raw Markdown
opendocs pull --project                      # Download every doc in the active project
opendocs pull --workspace                    # Download every doc in the active workspace
opendocs export <id|slug> --format pdf       # Export a published post as PDF (or docx)
opendocs export a b c --format pdf           # Batch export up to 10 posts at once (UUIDs or slugs)
opendocs unpublish <id|slug>                 # Take a post offline (content and history kept; no republish)
opendocs visibility <id|slug> <level>        # Change visibility without re-uploading Markdown
opendocs delete <id|slug> --yes              # Permanently delete a post (frees its slug + quota slot)
opendocs whoami                              # Show current user/workspace/project
opendocs workspace list                      # List every workspace you belong to (alias: `workspace ls`)
opendocs workspace use <slug>                # Switch the active workspace (alias: `workspace switch`)
opendocs agent                               # Print concise AI-agent instructions
opendocs agent --full                        # Print the full bundled SKILL.md
opendocs agent --install                     # Install this skill for every agent on this machine
opendocs mcp add                             # Register the OpenDocs MCP server in your coding tools
opendocs mcp connect claude                  # Add OpenDocs to the Claude app (or: chatgpt)
opendocs logout                              # Clear stored credentials
```

Every command accepts `--json` for machine-readable output and `--api-url <url>` to override the API endpoint. When running programmatically, always pass `--json` — stdout becomes a single parseable JSON object, errors go to stderr, and human-readable spinners are suppressed.

**Every command that takes a `<postId>` also accepts a slug.** The slug is the post's human-readable path segment in the URL and is unique within the active project. Prefer post slugs when the user names a doc in natural language: `opendocs get my-report` is friendlier than copying the UUID from `opendocs list --json`. Internally the API resolves slug → postId via an indexed lookup scoped to the active workspace/project and then does the same ownership check as the UUID path.

**Workspace slug vs username — they are different things.** The URL is built from the *workspace* slug, not the user's username. Default project docs use `opendocs.cc/<workspace>/<post>`. Non-default project docs use `opendocs.cc/<workspace>/projects/<project>/<post>`. The username still exists for attribution in the UI, but it doesn't appear in published URLs.

---

## OpenDocs over MCP

OpenDocs also runs a remote MCP server at `https://mcp.opendocs.cc/mcp` (guide: https://opendocs.cc/mcp). Each app signs the user in to OpenDocs with OAuth the first time it uses it; no API key is involved.

- **Chat apps (Claude, ChatGPT):** add it as a custom connector with that URL. `opendocs mcp connect claude` opens Claude's "Add custom connector" dialog with OpenDocs.cc filled in; `opendocs mcp connect chatgpt` opens ChatGPT's plugins page (then "+" → "Add custom MCP server"). Both copy the URL to the clipboard.
- **Coding tools:** `opendocs mcp add` registers it in every tool it finds (Claude Code, Codex, Cursor, VS Code, Windsurf, Gemini, opencode, Kiro) and prints a one-line instruction for the others. `--agent <id...>` picks tools, `--dry-run` shows what would change, `opendocs mcp remove` takes it out again, and `opendocs agent --install --mcp` installs this skill and the server together.
- **MCP tools or the CLI?** If OpenDocs MCP tools are available and you can't run shell commands, use them instead of the CLI; they take Markdown text directly. If you have a shell, prefer the CLI for local files, folders and images: it uploads local images, publishes whole folders in batches and remembers what each folder published.

---

## Setup

### Install

Ways to get OpenDocs into an agent:

```bash
# Node.js 20+: the full CLI (recommended), then this skill for every agent it finds
npm install -g @opendocs.cc/cli
opendocs agent --install                 # SKILL.md + scripts/opendocs.sh, no network needed

# Node.js 22+: the same skill through the skills CLI
npx skills add opendocs-cc/skills --skill opendocs -g -y

# No Node.js: installs this skill + scripts/opendocs.sh (curl + jq)
curl -fsSL https://opendocs.cc/install.sh | bash
```

`opendocs agent --install` installs into the global skills folder of each agent
whose config folder exists: `~/.claude/skills` (Claude Code), the shared
`~/.agents/skills` (Codex, Cursor, GitHub Copilot, Gemini CLI, opencode,
OpenClaw, Windsurf, Amp, Goose, Grok Build), `~/.cline/skills`,
`~/.hermes/skills` and `~/.kiro/skills`. `opendocs agent --list` shows each
agent's folder and whether it was found; `--agent <id...>` installs for
specific agents even if they weren't found (`--agent claude-code codex`).
Re-run it after updating the CLI to update the skill. It prints which folders
it wrote; with `--json`, `installed[]` has `agent`, `path` and `status`.

In Claude Code you can also install it as the OpenDocs.cc plugin, which adds
`/opendocs-cc:publish` and `/opendocs-cc:export`, connects the MCP server and
keeps the skill up to date: `/plugin marketplace add opendocs-cc/skills`, then
`/plugin install opendocs-cc@opendocs-cc`. In Codex:
`codex plugin marketplace add opendocs-cc/skills`, then
`codex plugin add opendocs-cc@opendocs-cc`.

`npx skills add` may end with `✗ opendocs → PromptScript: PromptScript does not
support global skill installation`. That's a known installer bug that only
affects PromptScript; the skill is installed, so carry on.

If the `opendocs` command isn't available and Node.js isn't installed, use
`bash scripts/opendocs.sh` (in this skill's folder) instead — see
"Without Node.js" below. Everything else in this guide applies to both.

### Check if the CLI is installed and authenticated

```bash
opendocs --version    # prints the installed CLI version
opendocs whoami       # shows username + workspace name (the URL slug lives in the JSON output)
```

`opendocs whoami --json` is the most useful diagnostic command for an agent — it returns the CLI's active workspace slug (for building post URLs) plus the account/workspace context and document quota in one call:

```json
{
  "userId": "...",
  "onboarding": { "username": "...", "workspace": { "id": "...", "name": "Acme Docs", "slug": "acme-docs" } },
  "quota": { "documents": { "plan": "free", "limit": 50, "used": 3, "remaining": 47 } }
}
```

For Pro/Team workspaces, `quota.documents.limit` and `remaining` are `null` (meaning unlimited). The publish endpoints still re-check quota against the explicit `workspaceId` in the request body, so a stale local config can't bypass server enforcement.

If the CLI is missing:

```bash
npm install -g @opendocs.cc/cli
```

If the user isn't logged in, **sign them up (or in) before their first publish**, from the terminal with an emailed code: no browser, no copying API keys. An account is free for up to 50 documents and is what the user wants by default: links stay up, stay private to their workspace, can be updated in place and exported as PDF.

1. Ask the user for their email address.
2. Run `opendocs login --email <email> --json`. It emails a 6-digit code and exits immediately with `{"status": "code_sent", ...}`.
3. Tell the user: "Check your inbox for a sign-in code from OpenDocs and paste it here."
4. Run `opendocs login --email <email> --code <code> --json`.

If the email is new, this creates the account, a username, a workspace (`opendocs.cc/<username>`) and a default project, then saves a new API key named after your agent (e.g. `claude-code`) to the CLI config. Existing accounts just get a new key. `opendocs signup` is an alias. Codes expire after 10 minutes and allow 5 attempts; on `invalid_code` ask for the newest email, on `code_expired` run step 2 again.

**Only if the user doesn't want an account yet**, offer an anonymous publish instead:

```bash
opendocs publish notes.md --anonymous --json
```

Anyone with the returned `url` can read it for 24 hours, then it is deleted. Share the `claimUrl` with the user exactly as returned, and offer to sign them up so it's kept: running `opendocs login --email ...` later **from the same folder** claims it into their new workspace automatically (or run `opendocs claim`). Never publish anonymously unless the user agreed that a link anyone can open is OK.

Other ways to log in: humans at a terminal can use `opendocs login --browser`; scripts and CI can use an existing key:

```bash
opendocs login --key od_live_xxxxx
# Or pass it via env var for scripts / CI:
export OPENDOCS_API_KEY=od_live_xxxxx && opendocs login
```

**Never run bare `opendocs login` from an agent.** Without `--email`, `--key` or the env var it prompts for an API key on stdin and your tool call will hang. `OPENDOCS_API_URL` overrides the built-in `https://api.opendocs.cc` endpoint.

---

## Working with multiple workspaces

A user can belong to more than one workspace — a personal free workspace plus a Team-plan workspace, multiple Team workspaces, or any mix. The CLI stores **one active workspace at a time** in `~/.config/opendocs/config.json`. `publish` and `update` act on that active workspace (URL prefix, quota, and all). `list` defaults to it too, with `--all` as the escape hatch when the user wants to see every workspace's posts at once. There is no per-invocation `--workspace` flag on mutating commands; the switch is configured once and persists until you change it.

## Working with projects

Each workspace has a Default project plus optional named projects. Use a project
whenever an agent is publishing a coherent batch of docs for a product, launch,
client, experiment, or repo. Default is best for one-off docs.

```bash
opendocs project list --json
opendocs project create "OpenClaw docs" --slug openclaw-docs --use --json
opendocs publish ./docs --json
opendocs project use default --json
```

`opendocs workspace use <slug>` resets the active project to that workspace's
Default project. `opendocs list` shows the active project by default and
ends by saying how many documents the other projects have (`otherProjects` in
`--json`); `opendocs list --all-projects` shows every project in the active
workspace. When the user asks for "all my docs", use `--all-projects`.

### List every workspace you belong to

```bash
opendocs workspace list                # alias: `opendocs workspace ls`
opendocs workspace list --json
```

The active workspace is marked with a `✔`. Each row has a name, slug, role (`owner` / `admin` / `member`), and active indicator. In `--json` mode:

```json
{
  "workspaces": [
    { "id": "ws_123", "name": "Acme", "slug": "acme", "role": "owner" },
    { "id": "ws_456", "name": "Side Project", "slug": "side-project", "role": "member" }
  ],
  "activeSlug": "acme"
}
```

Ordered by join date (earliest first). Only active memberships are returned — pending invitations and disabled members don't show up.

### Switch the active workspace

```bash
opendocs workspace use acme-labs       # alias: `opendocs workspace switch`
```

After the switch, the next `opendocs publish` creates posts under `opendocs.cc/acme-labs/<post-slug>` and `opendocs whoami` reflects the new active workspace. In `--json` mode the response is `{ "success": true, "workspaceId": "...", "workspaceName": "...", "workspaceSlug": "..." }`.

**Switching is purely local — it only touches the CLI's config file.** No server-side state changes, nothing is synced, and the web dashboard's active workspace is independent. The server validates the `workspaceId` on every post mutation, so you can't "switch" into a workspace you aren't a member of — `workspace use <slug>` rejects unknown slugs up front with `not_a_member`.

### Notes for agents

- **`opendocs whoami --json` is the cheapest way to read the active workspace.** It returns `onboarding.workspace.slug` directly — no need to hit `workspace list` just to answer "which workspace will the next publish go to?".
- **`opendocs login` picks the first workspace by default.** If the user belongs to multiple, login prints a hint but doesn't prompt — it picks the one the user joined first. After login, run `opendocs workspace use <slug>` if a script needs a specific workspace.
- **Confirm the active workspace before publishing when the user names one.** If the user says "publish this to the Acme workspace", don't assume the current active one is Acme. Run `opendocs workspace list --json`, match on `slug` or `name`, and `opendocs workspace use <slug>` first — skip the switch if `activeSlug` already matches.
- **Single-workspace users see the same commands work.** `workspace list` returns one row; `workspace use <your-only-slug>` is a successful no-op. You don't need to branch on membership count.

---

## Public API quick reference

Prefer the CLI for local-file workflows because it handles auth config, folder walking, local image uploads, batching, SSE progress, and export file placement. Use the public API directly when building an integration, backend job, or custom agent tool.

**Auth:** send API keys as `Authorization: Bearer od_live_...`. Session-cookie routes exist for the dashboard, but agent/tool builders should stick to the API-key-compatible routes below.

| Task | Endpoint | Notes |
|---|---|---|
| Current user + quota | `GET /api/v1/me?workspaceId=ws_...` | Pass `workspaceId` for multi-workspace accounts so quota matches the workspace you're about to publish to. |
| List workspaces | `GET /api/v1/workspaces` | API-key compatible; used by `opendocs workspace list/use`. |
| Publish one doc | `POST /api/v1/publish` | Requires `markdown` and `workspaceId`; max 1 MB Markdown. |
| Publish many docs | `POST /api/v1/publish/batch` | Max 25 docs per request; JSON returns `207`, SSE streams `result` + `summary` events. |
| List / search posts | `GET /api/v1/posts?workspaceId=...&projectId=...&q=...&tag=...&page=1&limit=100` | `q` matches words in titles and summaries. Omit `workspaceId` to list across workspaces authored by the caller. |
| Get metadata / Markdown | `GET /api/v1/posts/:idOrSlug`, `GET /api/v1/posts/:idOrSlug/raw` | Slugs can be disambiguated with `?workspaceId=...`. |
| Update / unpublish / visibility / tags / delete | `POST /api/v1/posts/:idOrSlug/update`, `POST /api/v1/posts/:idOrSlug/unpublish`, `POST /api/v1/posts/:idOrSlug/visibility`, `PATCH /api/v1/posts/:idOrSlug/tags`, `DELETE /api/v1/posts/:idOrSlug` | Updates create a new version but keep the URL stable. |
| Export one / many | `POST /api/v1/posts/:idOrSlug/export/:format`, `POST /api/v1/posts/batch/export` | `format` is `pdf` or `docx`; batch export max is 10 and returns a zip + manifest. |
| Version history | `GET /api/v1/posts/:idOrSlug/versions`, `GET .../versions/:n/raw`, `POST .../versions/:n/restore` | Restore publishes the old content as a new version. |
| Move / share | `POST /api/v1/posts/:idOrSlug/move`, `GET/POST/DELETE /api/v1/posts/:idOrSlug/share` | Share body: `{ "emails": [...], "domains": [...] }`. |
| Workspaces / team | `POST /api/v1/workspaces`, `POST /api/v1/workspace/team/invite`, `GET /api/v1/workspace/team?workspaceId=` | API-key compatible. |
| Sign-in codes (no key) | `POST /api/v1/auth/code/request`, `POST /api/v1/auth/code/verify` | Verify returns `apiKey`, `workspace`, `defaultProject`; creates the account if new. |
| Anonymous (no key) | `POST /api/v1/anonymous/publish`, `PUT /api/v1/anonymous/:id`, `POST /api/v1/anonymous/claim` (key) | 24-hour links; claim moves the doc into a workspace. |

Send `X-OpenDocs-Client: <agent>` (e.g. `claude-code`, `cursor/finance-bot`) on every request so the dashboard and version history show which agent published. `POST .../update` accepts `baseVersionNumber`; when the live post has moved past it you get `409 version_conflict` instead of overwriting someone's work, and identical content returns `unchanged: true` without a new version. API error bodies include `error`, `message` (how to fix it) and `docs_url`; the CLI's `--json` errors carry `error` and `message`. The machine-readable spec is at https://opendocs.cc/openapi.json.

API `url` fields are relative paths like `/<workspace-slug>/<post-slug>`. Responses also carry `publicUrl`: the absolute link to share, on the workspace's custom domain when it has one (for every published document, public or not) and on `https://opendocs.cc` otherwise. **Always give the user `publicUrl`.** Only when it's missing (older servers), prepend `https://opendocs.cc` to `url`.

---

## Plans and limits

Workspaces are on one of three plans. The CLI (and the API) enforce per-plan caps server-side, so you can't sneak past them — and a couple of these caps are easy for an agent to hit without realising:

| Plan | Documents per workspace | Workspaces | Members/workspace | DOCX export | Export branding | Export footer | Integrations |
|---|---|---|---|---|---|---|---|
| **Free** | **50** | 1 | 3 | ❌ PDF only | ✅ logo, color, font, presets | "Made with OpenDocs" (fixed) | ❌ |
| **Pro** ($8/mo) | Unlimited | 2 included, then $4/mo each | 5 | ✅ | ✅ | Your own, or none | ✅ |
| **Team** ($4/user/mo, 3-seat min) | Unlimited | Unlimited | Unlimited | ✅ | ✅ | Your own, or none | ✅ |

Every plan can brand its exports: logo, brand color, font and presets are free. What costs money is more than 50 documents, Word export, replacing the "Made with OpenDocs" footer, integrations (Google Drive, signatures) and a custom domain for the workspace.

The cap that bites agents most often is the **Free document limit**. Before any batch publish, the CLI does a best-effort `/api/v1/me` quota pre-check and rejects early if the batch clearly won't fit:

```json
{
  "error": "document_limit",
  "message": "Cannot publish 5 files: your free plan has 1 slot left (50/50 used). Upgrade to Pro for unlimited documents, or unpublish existing docs first."
}
```

When this happens, the right move depends on what the user wants:

- **They want to upload everything** → tell them about the limit and suggest upgrading to Pro, or ask which docs they'd rather keep. Don't loop and retry — the cap won't change.
- **They want to publish just a few** → publish the first N (where N = remaining slots) and report which ones got skipped.
- **They have stale docs** → they can `opendocs list`, `opendocs unpublish` the ones they don't need, then re-run.

**DOCX export requires Pro or Team.** If the user is on Free and asks for a Word document, the export endpoint returns `403`. Suggest PDF instead, or upgrade.

**Free-plan PDFs include a "Made with OpenDocs" footer**, even with the workspace's own logo, color and font. Worth flagging if the user is exporting a PDF they intend to send to a client and you can see they're on Free — they may want to upgrade before exporting rather than after.

The other caps (workspace count, member count) only come up when the user wants a new workspace or teammate. The CLI can do both (`opendocs workspace create`, `opendocs team invite`), but never on its own initiative: run them only when the user asks, after confirming the workspace name, or the email and role, with them. If you do see `plan_limit` or `member_limit` come back from the API, point the user at the dashboard.

---

## The hero workflow: publish and export in one step

This is the pattern that makes OpenDocs uniquely useful for an agent. Pass `--export pdf` (or `--export docx`) to `opendocs publish` and you get both:

- A **shareable URL** on opendocs.cc, and
- A **branded PDF or DOCX file** on disk, right next to the source `.md`.

```bash
opendocs publish docs/report.md --export pdf --json
# Creates:
#   - A post at opendocs.cc/<workspace>/report
#   - A file at docs/report.pdf  (next to the source)
# Returns a single JSON blob with both the URL and the local file path.
```

**Use this whenever** the user says something like "publish this doc and send me a PDF", "turn these notes into a shareable report", or "upload and download as PDF". It's one HTTP round trip fewer than the two-step flow (`publish` → `export`) and the CLI handles the postId → file mapping for you.

If publish succeeds but export fails (the converter briefly unavailable, say), the posts stay up and the CLI prints a retry hint — `opendocs export <postId> --format pdf` — so the agent can re-run just the export phase.

---

## Publishing

### One file

```bash
opendocs publish my-document.md
```

The CLI reads the file, extracts the first `# Heading` as the title, and returns a shareable URL. In `--json` mode:

```json
{ "postId": "abc123", "slug": "my-document", "url": "/<workspace>/my-document", "publicUrl": "https://opendocs.cc/<workspace>/my-document", "title": "My Document" }
```

Give the user `publicUrl`: it's the full link, on the workspace's custom domain (`https://notes.acme.com/my-document`) when it has one. `url` is the path on opendocs.cc, built from the workspace and post slugs.

**Flags:**

| Flag | Description |
|------|-------------|
| `--title <title>` | Override the document title (single-file only) |
| `--slug <slug>` | Custom post slug — `my-doc` → `opendocs.cc/<workspace>/my-doc` (single-file only) |
| `--visibility <v>` | `private`, `workspace` (default), or `public` |
| `--tags <tags>` | Comma-separated tags — `"tutorial,release-q2"` |
| `--confirm-public` | Required alongside `--visibility public` |
| `--export <fmt>` | Also export to `pdf` or `docx` after publishing |
| `--project <name>` | Project name, slug or ID. A new name creates the project. |
| `--anonymous` | No account needed: a link anyone can open for 24 hours |
| `--new` | Create a new document even if this folder already published the file |
| `--force` | Overwrite even if someone published a newer version since your last sync |

**Publishing the same file again updates it.** The CLI records each published file in `.opendocs/state.json` (in the current folder, or the nearest parent that has one), so `opendocs publish notes.md` a second time creates version 2 of the same URL instead of a `notes-2` duplicate. You don't need `opendocs update` for files you published from this folder. In `--json` mode those files come back under `updated[]` with `action: "updated" | "unchanged" | "conflict" | "failed"`.

### Many files at once

Pass more than one file, or pass a folder, and the CLI uses the batch endpoint — one authenticated request handles up to 25 documents at a time, and the CLI auto-chunks larger invocations into sequential batches.

```bash
opendocs publish doc1.md doc2.md doc3.md
opendocs publish docs/*.md                          # shell glob
opendocs publish ./vault --tags obsidian            # recursive folder/vault upload
opendocs publish docs/*.md --tags "release-q2"      # shared tag applies to every file
```

**Never loop `opendocs publish` once per file.** The batch endpoint is designed for exactly this case — it authenticates once, processes the docs sequentially server-side with per-doc partial-success reporting, and emits live per-doc progress. Looping in a shell round-trips the network and the config N times and is dramatically slower.

**Progress output (interactive mode):** doc-by-doc, streamed as each publish completes:

```
Publishing batch 1/2 (25 docs)...
✔ guide.md → opendocs.cc/acme-docs/guide  (1/30)
✔ intro.md → opendocs.cc/acme-docs/intro  (2/30)
✖ duplicate.md — slug already exists  (3/30)
...
29 of 30 published. 1 failed.
```

**Partial success is the norm, not an error.** If one doc fails, the other 29 still publish. The CLI prints `✖ <file> — <reason>` inline and continues. `--json` mode returns one merged object with `total`, `succeeded`, `failed`, and a `results` array covering every file. A completed batch with per-doc failures still exits 0; inspect `failed` / `results[].success` to decide what to retry. Non-zero exits are for pre-flight failures, auth/config errors, network failures, or an aborted batch.

**Limits:**

| Limit | Value | What happens if exceeded |
|---|---|---|
| Markdown size per document | **1 MB** (~500 pages of prose) | CLI fails pre-flight with `doc_too_large`; no network call made. |
| Files per invocation | **500** | CLI fails pre-flight with `too_many_files`. Split into multiple runs. |
| Docs per publish batch HTTP request | **25** | Handled transparently — auto-chunked with cumulative progress. |

When a folder is passed, the CLI recursively publishes `.md` files and skips `.obsidian`, `.trash`, `.git`, `.hg`, `.opendocs`, and `node_modules`.

`--title` and `--slug` do not work with multiple files — each doc gets its title from its first `# heading` and a slug from the title. `--visibility`, `--tags`, and `--confirm-public` apply to every doc in the invocation.

### Inline images are uploaded automatically

If your Markdown references a local image — `![alt](./img/diagram.png)` or `![alt](/abs/path.png)` — the CLI uploads it to OpenDocs storage *before* publishing the doc and rewrites the link to the resulting public URL. Agents don't need to upload images manually or pre-process the Markdown. Things to know:

- **Remote URLs are left alone.** `![alt](https://example.com/x.png)` passes through unchanged.
- **Image caps:** max 30 local image references per document, max 10 MB per image. Supported extensions are `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, and `.svg`.
- **If image storage isn't configured server-side** (some self-hosted setups), the CLI prints a one-time warning and publishes with the *original* refs intact — the doc goes up but images render broken. Not an error; just a warning.
- **If a specific image is missing, outside the document directory, too large, unsupported, or rejected during upload**, the CLI warns `Image skipped: <ref> — <reason>` and publishes with that original ref intact. The hard `image_upload_failed` error is reserved for failures that abort the image-upload phase as a whole.

### Update an existing document

```bash
opendocs list --json                              # find the post (or just recall the slug)
opendocs update revised.md --post-id my-report    # slug works — same effect as passing the UUID
opendocs update revised.md --post-id abc123       # or UUID from `opendocs list --json`
```

This creates a new version — the URL stays the same, previous versions are preserved server-side. Use it for files this folder didn't publish (otherwise just re-run `publish`). Same flags as `publish` except:

- **`--slug` is not allowed** (slugs are immutable after first publish).
- **`--export` is not supported on `update`.** If the user wants the updated PDF/DOCX too, run a separate `opendocs export <slug> --format pdf` after the update succeeds. For files published from a folder, re-running `opendocs publish <folder> --export pdf` is simpler: it updates the files that changed and writes a fresh PDF for every file in the folder.
- **`--visibility` has no default.** Omit it to preserve the post's current visibility. Pass it (with `--confirm-public` if going public) to change it.
- **`--tags` has no default.** Omit it to preserve the post's current tags. Pass it only when you want to replace the tag list.
- **`--post-id` is required** and accepts either the UUID or the slug.

---

## Sync a folder (clone, status, conflicts)

```bash
opendocs clone --json                 # whole workspace → ./<workspace-slug>/ (projects in projects/<slug>/)
opendocs clone docs --project launch  # one project into ./docs
cd <folder>
opendocs status --json                # per file: up-to-date | modified | behind | conflict | untracked | ...
opendocs publish . --json             # publish every change; new files become new docs
```

- `behind` means someone published a newer version. Get it with `opendocs pull <file.md> -o <file.md>` (that also re-syncs the file).
- `conflict` (from `status` or a publish result) means it changed both locally and online. Show the user, pull the live version to compare (`opendocs pull <doc> --stdout`), and only re-run with `--force` if they want their copy to win.
- `.opendocs/` is git-ignored automatically (it holds claim tokens). Don't commit it.

## Version history

```bash
opendocs history <doc> --json                 # versions newest-first, with who/which agent published
opendocs pull <doc> --version 2 --stdout      # read an old version
opendocs rollback <doc> 2 --json              # publish v2's content again as a new version
```

`<doc>` can be a post ID, slug, or a local `.md` file this folder published. Rollback never deletes history, so it can itself be undone.

## Projects

`--project "Client X"` on `publish` creates the project the first time. Other project commands:

```bash
opendocs project list --json                       # names, doc counts and recentTitles per project
opendocs project current --json                    # where the next publish goes, and why
opendocs project link "Client X" --json            # this folder → that project (created if new)
opendocs project unlink --json
opendocs list --project client-x --json
opendocs move <doc> --project "Archive" --json     # URL changes; content untouched
opendocs export --project client-x -f pdf --json   # every doc, batched automatically, into ./client-x-pdf/
```

A new file is published to, in order: `--project`, its `projects/<slug>/` folder
inside a cloned workspace, the folder's linked project, then the active
project. The publish output says which (`projectSource`). Files already
published stay in their project unless you `move` them.

## Keeping documents organized (projects work like git branches)

People rarely sort their own documents; you should. Treat a **project** the way
you treat a **git branch**: one per distinct body of work — a client, a repo, a
product, a launch, a research topic. You wouldn't commit unrelated work to the
current branch just because it's checked out; don't publish an unrelated
document into the active project just because it's active.

**Before publishing**, know where it will go and whether that fits:

1. `opendocs whoami --json` → `organize` (the user's preference: `ask`,
   `auto` or `off`; default `ask`) and `folderProject`.
2. `opendocs project current --json` → the project the next publish would use.
3. `opendocs project list --json` → existing projects with `recentTitles`.

**Notice a context switch** — the equivalent of "this needs a new branch":

- The user starts talking about a different client, repo, product or initiative.
- You're working in a different repository or folder than before.
- The document's subject doesn't match the target project's name or its recent titles.
- The user says "new project", "separate this", "for the Acme work", etc.

**Then:**

- **An existing project clearly matches** → publish with `--project <slug>`
  (or `project link` it if you'll keep working in this folder). Just tell the
  user where it went; no need to ask.
- **Nothing matches and it's an ongoing body of work** (you expect more than
  one document) → with `organize: ask`, ask once: *"This looks like a new
  topic — want me to start an 'Acme launch' project for it?"*. With
  `organize: auto`, create it (`--project "Acme launch"`) and say so. With
  `organize: off`, use the active project.
- **Working inside a repo or folder dedicated to one topic** → run
  `opendocs project link "<project>"` once, like checking out a branch for the
  repo. Every new doc published from there lands in that project.
- **A one-off document** (a quick note, a single answer) → the active or
  Default project is fine. Don't create a project for one document.

**Don'ts:** don't create near-duplicates (reuse "Acme" instead of making
"Acme Corp" — check `project list` first); don't move or rename existing
documents or projects without asking; don't switch the global active project
(`project use`) for a single document — prefer `--project` or a folder link.

If the user tells you how they like things organized ("always keep my stuff
sorted", "stop asking"), save it with `opendocs config set organize auto` (or
`ask` / `off`) so every agent and session follows it.

## Linking related documents

Documents are much more useful when they point at each other. The public
OpenDocs workspace (https://opendocs.cc/opendocs-hq) works this way: the
welcome doc links to the guides, and each guide links to the next step and to
related topics. Do the same whenever you publish docs that belong together, or
a new doc that builds on one already published:

- Link inline where a doc mentions another ("see [Pricing](https://opendocs.cc/acme/pricing)").
- End with a short **Related** list of two to five docs the reader is likely to want next.
- For a project with several docs, publish an overview doc that links to every
  doc in it, and link back to the overview from each one.
- When you update a doc that others link to, keep its URL: update it in place
  (`opendocs publish` on the same file, or `opendocs update`), don't publish a copy.

**Use full URLs.** Local links like `[Setup](./setup.md)` are not rewritten
when you publish, so they break on the web and in exports. Root-relative links
(`/acme/setup`) work on the web but not in PDF or Word files. Always write
`https://opendocs.cc/...`, or the workspace's custom domain (below).

**The URL depends on the project:**

| Where the doc lives | URL |
|---|---|
| Default project | `https://opendocs.cc/<workspace-slug>/<post-slug>` |
| Any other project | `https://opendocs.cc/<workspace-slug>/projects/<project-slug>/<post-slug>` |

`/<workspace>/<post-slug>` only finds docs in the **Default** project: a doc in
the `use-cases` project lives at `/<workspace>/projects/use-cases/<post-slug>`
and nowhere else. Slugs are unique per project, not per workspace. Don't build
URLs by hand: take them from `opendocs publish --json`, `opendocs list --json` or
`opendocs get <doc> --json`. Use `publicUrl` when it's there (it's already
absolute). Otherwise use `url`: add `https://` if it starts with `opendocs.cc`,
or `https://opendocs.cc` if it starts with `/`.

**Custom domains.** A Pro or Team workspace can serve its documents on its own
domain, for example `https://notes.acme.com/plan` instead of
`https://opendocs.cc/acme/plan` (set up in **Dashboard → Workspace settings →
Custom domain**). Every published document then lives on that domain (readers
of ones that aren't public sign in there): `publicUrl` points there, and old
`opendocs.cc` links redirect, so they keep working. When you send the user
links, or link documents to each other, use `publicUrl`, never a URL built
from `url`.

**Linking docs you publish together.** A doc has no URL until its first
publish, so:

1. Publish the batch once (`opendocs publish ./docs --json`) and note each doc's `url`.
2. Replace local links (`./setup.md`) and placeholders with those URLs.
3. Run the same `opendocs publish ./docs --json` again. Each file updates its
   own doc (a new version at the same URL); nothing is duplicated.

For a single file you can fix the URL in advance with `--slug`, since slugs
never change after the first publish.

**Moving a doc changes its URL.** `opendocs move <doc> --project <name>` gives
it a new URL (returned as `url`) and the old one stops working; there's no
redirect. Moving into or out of the Default project changes the URL shape too.
After a move, find the docs that link to it (`opendocs pull --project` and
search, or ask the user) and update their links. Mention this before moving a
doc that others link to.

Links work for readers who can open the target: a public doc linking to a
workspace-only doc sends outside readers to a sign-in page. Keep that in mind
when linking from public docs.

## Sharing outside the workspace

```bash
opendocs share <doc> sam@acme.com --json          # emails Sam a link
opendocs share <doc> @acme.com --no-notify --json # everyone with an @acme.com email
opendocs share <doc> --json                       # who has access
opendocs share <doc> sam@acme.com --remove --json
```

Prefer this over `--visibility public` whenever the user wants to send a doc to specific people (clients, contractors). Guests sign in with that email (an emailed code verifies it) and can read only the shared document; they don't join the workspace.

## Team and workspaces

Adding people always goes through an email invitation the person accepts, so
nobody is added without confirming. Admin side (active workspace):

```bash
opendocs team invite dana@acme.com [--role admin] --json   # emails Dana an invite
opendocs team list --json            # members, pending invitations, auto-join domains
opendocs team resend dana@acme.com --json
opendocs team revoke dana@acme.com --json
opendocs team role dana@acme.com admin --json
opendocs team remove dana@acme.com --yes --json
opendocs team auto-join add acme.com --json   # anyone with a verified @acme.com email can join
opendocs workspace create "Acme Research" [--slug acme] --json   # also switches to it
```

Invitee side (the person who was invited, signed in with that email):

```bash
opendocs team invitations --json     # invites to you + workspaces open to your email domain
opendocs team join [workspace] --json   # accepts and switches to it (--no-switch to stay)
opendocs team decline <workspace> --json
opendocs team leave --yes --json
```

Rules for agents:

- "Add Dana to the team" → confirm the exact email and the role (default
  `member`; `admin` only if asked) before running `team invite`, because it
  sends an email. Then tell the user Dana has to accept the email.
- `opendocs login` lists pending invitations (`pendingInvitations`). Ask the
  user before joining: *"Jane invited you to Acme — join it?"*
- `team remove` and `team leave` need `--yes`; only pass it after the user
  confirmed. `auto-join` only accepts the admin's own email domain, never
  gmail.com-style providers.
- Plan limits apply: Free workspaces have 3 members, Pro 5; `member_limit`
  means an admin needs to upgrade.

## Branding your documents (export theme)

Every PDF and Word export uses the workspace's theme: a brand color, a font,
an optional logo (top right) and a footer. Owners and admins can change the
color, font, preset and logo on **every plan, Free included**. Only the footer
needs Pro or Team: Free exports always end with "Made with OpenDocs"
(`canEditFooter` in `opendocs theme --json` says whether you can change it).
A theme change affects **every** export in the workspace, so:

**Always confirm with your human before changing the theme.** Show them what
you propose (preset name, or color + font) and wait for a yes. The `set`,
`footer` and `logo` commands refuse to run without `--yes` when not in a
terminal; only pass `--yes` after the human agreed.

```bash
opendocs theme --json                    # current color, font, preset, logo, footer, canEdit, canEditFooter
opendocs theme presets --json            # curated color + font pairs (start here)
opendocs theme fonts --json              # fonts available in exports
opendocs theme check "#13294B" --json    # is this color dark enough? (changes nothing)
opendocs theme set --preset boardroom --yes --json
opendocs theme set --color "#0B3D5C" --font "IBM Plex Sans" --yes --json
opendocs theme set --logo-in-exports on --yes --json
opendocs theme logo ./logo.png --yes --json    # PNG/JPEG/WebP, max 2 MB
opendocs theme footer --company "Fjord" --tagline "Data platform team" --link-url fjord.example --yes --json   # Pro/Team
opendocs theme footer --off --yes --json  # Pro/Team
```

Presets: `classic` (OpenDocs purple, Arial), `boardroom` (navy, IBM Plex Sans),
`editorial` (oxblood, Vollkorn), `research` (forest green, Merriweather),
`studio` (graphite, Inter), `field-guide` (deep teal, Lato), `letterpress`
(rust, EB Garamond), `terminal` (cobalt, JetBrains Mono), `launch` (fuchsia,
Manrope).

How to choose well:

- **Prefer a preset.** Each is a tested color and font pairing. Suggest the one
  that fits the documents: boardroom for investor/board/policy docs,
  editorial for long essays and reports, research for papers, studio for specs
  and release notes, field-guide for handbooks, letterpress for proposals and
  letters, terminal for changelogs and incident reviews, launch for launch
  briefs and announcements.
- **The brand color must be dark.** The converter uses it for headings, links,
  the table-header background (with white text on it) and the footer, and
  tints zebra rows and code blocks with a very light wash of it. It needs at
  least 4.5:1 contrast against white (the API refuses lighter colors with
  `low_contrast`) and should be 7:1 or more. Run `theme check` first.
- **Use the deepest usable shade of the brand's hue.** If the company color is
  a bright blue (#2F80ED), use a navy of the same hue (#13294B or #1B3A6B), not
  the bright one. Never pastel, neon, yellow or light grey.
- **Body text is always near-black** (#171717) and can't be changed; that's on
  purpose, for readability.
- **Fonts:** serif (Merriweather, Vollkorn, EB Garamond) for long,
  reading-heavy documents; sans (Inter, IBM Plex Sans, Lato, Roboto, Manrope,
  Arial) for specs, memos and handbooks; JetBrains Mono for technical logs. One
  font per workspace.
- **Logo:** square or wide PNG with a transparent background works best. It
  only appears in exports after `--logo-in-exports on`.
- After changing the theme, export one document as a preview
  (`opendocs export <doc> -f pdf`) and give the human the file to check.

`plan_required` from `theme footer` means the workspace is on Free, which keeps
the "Made with OpenDocs" footer; everything else in the theme still works.
Point the human to https://opendocs.cc/dashboard/billing if they want their own
footer. `forbidden` means only an owner or admin can change the theme.

On a Free workspace that still has the default theme, it's worth offering once,
after the first export: "Want me to set your logo, brand color and font for
exports? It's free." Owners and admins can also download a sample PDF with the
current theme from **Dashboard → Workspace settings → Export branding**.

## Integrations: Google Drive and signatures

Pro and Team workspaces can connect **Google Drive** (save documents into
folders the workspace named, e.g. "Board Minutes") and **DocuSeal**
(e-signatures). Owners and admins connect them and name the folders in the
dashboard; the CLI only uses them. `opendocs integrations --json` shows what's
connected, the folder names (`integrations[].destinations[].name`), who may use
them (`settings.usableBy`: `members` or `admins`), how signature requests are
sent (`settings.signatureConfirmation`: `chat` or `browser`) and the
`dashboardUrl` for connecting.

### Saving to Drive

```bash
opendocs integrations --json                                 # folder names
opendocs save minutes.md --folder "Board Minutes" --json     # PDF by default
opendocs save <doc> --folder "Board Minutes" --format docx --version 3 --filename "Minutes 2026-10-24" --json
```

- **Only save when the user asks** to save or file a document in Drive or a
  named folder. Publishing or exporting never implies it.
- **Use a folder name exactly as `opendocs integrations` lists it. Never guess
  one.** If the user's words don't clearly match a single name, ask. On
  `destination_not_found` the error lists the names (`destinations`).
- Give the user the Drive link (`file.url`) on its own line. `file.verified:
  true` means Google's checksum matches the file OpenDocs rendered
  (`file.sha256`).

### Requesting signatures

For a document that needs signing (contract, offer letter, minutes, policy
sign-off), mark where people sign with a `signature` block, usually at the end.
`role` is required and unique; `name` and `title` are optional (only fill in
what the user told you):

````md
```signature
- role: Employee
  name: John Adams
  title: Head of Engineering
- role: Board member
  name: Jón Jónsson
```
````

Each entry renders as a signature box (signature line, name, title, date) on
the web and in exports, and DocuSeal places the signature and date fields
there. Without a block, OpenDocs appends one box per signer. Put the block
under a `## Signatures` heading and don't write Signature, Name or Date lines
by hand: they aren't signing fields and stay empty in the signed PDF.

Signing is always two separate steps:

```bash
# 1. Draft. Nothing is emailed. Prints a summary and the next step.
opendocs sign request offer.md \
  --signer "Employee=John Adams <adams@company.com>" \
  --signer "Board member=Jón Jónsson <jon@company.com>" \
  --subject "Please sign: Employment agreement" --message "Hi John, ..." \
  --expires 2026-11-30 --file-to "Signed agreements" --json

# Offer the user the exact PDF the signers will get (drafts only).
opendocs sign download <id> --kind draft

# 2. Send, only after the user said yes to that summary.
opendocs sign send <id> --yes --json

opendocs sign status <id> --json                     # who has signed
opendocs sign list [--doc offer.md] [--status pending] --json
opendocs sign download <id> [--kind signed|audit|draft] [-o <path>]   # signed PDF (default) / certificate / draft
opendocs sign save <id> --folder "Signed agreements" --json
opendocs sign cancel <id> --yes --json               # only when the user asks
```

Rules for agents:

- **Never invent or guess a signer's name or email**, and never complete a
  partial one (`john@` or "John from legal"). Use exactly what the user gave
  you or what the document says; ask for anything missing.
- `--signer` is `"Name <email>"` or `"Role=Name <email>"`, one per signer.
  Everyone is emailed at once by default; `--sequential` emails them one after
  another in the `--signer` order, when the user wants a signing order. When the document has a signature block, every role in it
  needs exactly one signer (`signer_roles_mismatch` lists the roles).
- **Read every signer and email back and get an explicit yes before `sign
  send`.** Show the summary `sign request` printed: document title and version,
  each signer as `1. John Adams <adams@company.com> — Employee`, the order
  (all at once by default; `--sequential`: one after another), subject and
  message, expiry, where the signed copy is filed, and any `warnings` (e.g. an
  address outside the workspace's email domains). "Looks fine?" or silence is
  not a yes.
- **Offer the draft PDF before they confirm**: `opendocs sign download <id>
  --kind draft` saves the exact file the signers will receive, so the user can
  read it first. Give them the local path. It's only available until the
  request is sent (`not_available` after).
- **Never run `sign send` in the same step as `sign request`**, and never pass
  `--yes` without that confirmation. If the user changes anything, cancel the
  draft and request a new one.
- **Respect browser mode.** When `confirmation.mode` is `browser`, API keys
  can't send (`approval_required`). Give the user `confirmation.approveUrl` on
  its own line, ask them to open it and click Send, and don't retry.
- When the user wants the signed copy filed in Drive, pass `--file-to
  "<folder>"` on `sign request`: the signed PDF and the signing certificate are
  saved there once everyone has signed. For a request that's already completed,
  use `opendocs sign save <id> --folder "<folder>"`.
- Follow up with `opendocs sign status <id>` when the user asks (statuses:
  `draft`, `pending`, `completed`, `declined`, `expired`, `cancelled`,
  `failed`). Don't poll in a loop.

## What to tell the user

- Put each URL on its own line with nothing else on that line — chat clients glue trailing punctuation into links.
- Say who can open it: "workspace members" (default), "only you" (private), "the people you shared it with", "anyone" (public), or "anyone with the link for the next 24 hours" (anonymous).
- For anonymous docs, give the `claimUrl` exactly as returned, say it expires in 24 hours, and offer to sign them up so it's kept.
- After `--export`, give the local file path. After an update, say which version it is now.
- Say which project it went to when it isn't the user's usual one, or when you picked or created it ("Published to the Acme launch project").
- If something failed, quote the `message` — it says what to do next.

---

## Without Node.js: `scripts/opendocs.sh`

The skill folder includes `scripts/opendocs.sh`, a bash client that only needs
`curl` and `jq` (the installer fetches a checksum-verified `jq` if missing). It
uses the same config (`~/.config/opendocs/config.json`) and folder state
(`.opendocs/state.json`) as the CLI, so installing the CLI later keeps the
login and the file → document mapping.

```bash
bash scripts/opendocs.sh login --email you@example.com              # emails a code
bash scripts/opendocs.sh login --email you@example.com --code 123456
bash scripts/opendocs.sh publish notes.md                          # again = update
bash scripts/opendocs.sh publish notes.md --anonymous              # 24h link, no account
bash scripts/opendocs.sh publish ./docs --tags q3 --project launch
bash scripts/opendocs.sh list | pull <doc> --stdout | history <doc>
bash scripts/opendocs.sh share <doc> sam@acme.com @acme.com
bash scripts/opendocs.sh export <doc> --format pdf
bash scripts/opendocs.sh claim
bash scripts/opendocs.sh team invite dana@acme.com     # | team list | team invitations | team join
bash scripts/opendocs.sh theme                         # | theme presets | theme set --preset <id> --yes
```

Results are one JSON object on stdout (progress on stderr); publish exits 1
if any file failed or conflicted. Differences from the CLI: local images are
not uploaded, `--project` must be an existing project slug (a folder link
set by the CLI's `project link` is honored), and there is no `status`,
`clone`, `rollback`, `move` or team admin beyond invite, or theme logo/footer — install the CLI for those.

---

## Exporting

OpenDocs renders Markdown into branded PDF or DOCX files server-side — not raw HTML-to-PDF. The output is a typeset document with custom fonts, accent colors, and consistent typography, meant for things a user would actually send to a client or print.

### One post

```bash
opendocs export my-report --format pdf     # by slug → writes my-report.pdf to cwd
opendocs export abc123 --format docx       # or by UUID — same result
```

**Flags:**

| Flag | Description |
|------|-------------|
| `-f, --format <format>` | `pdf` (default) or `docx` (Pro and Team) |
| `-o, --output <path>` | File path (single doc) or directory (multiple docs) |
| `--stdout` | Write binary to stdout — single doc only, useful for piping |
| `--landscape` | Landscape A4 (PDF only) |
| `--accent-color <hex>` | Hex color like `#B91C1C` — derives the full palette |

**Examples:**

```bash
opendocs export my-report --format pdf --accent-color "#14306E" -o report.pdf
opendocs export my-report --format pdf --stdout | lp             # pipe straight to a printer
```

### Batch (up to 10 docs)

Pass multiple IDs or slugs and the server converts them sequentially, returning a zip that the CLI unpacks locally:

```bash
opendocs export intro guide api-spec --format pdf                # by slug
opendocs export post1 post2 post3 --format pdf -o ./exports/     # or by UUID, unpacks into ./exports/
```

Much faster than N individual calls — one authenticated request, all conversions run back-to-back on the same server worker pool. **Use this after `opendocs list --tag <group>`** when the user wants every doc in a group as a bundle.

---

## Reading

### List, get, pull

```bash
opendocs list                                  # recent posts in the active workspace (alias: `opendocs ls`)
opendocs list --all                            # recent posts across every workspace you belong to
opendocs list --tag release-q2                 # filter by tag
opendocs list --page 2 --limit 50              # pagination
opendocs list --json --limit 100               # parse this in scripts

opendocs get my-report                         # by slug — no UUID copying needed
opendocs get abc123                            # or by UUID from `opendocs list --json`
opendocs pull my-report                        # download raw markdown → <slug>.md
opendocs pull my-report -o current.md          # explicit output path
opendocs pull my-report --stdout | head -20    # pipe to another tool
opendocs pull --project -o ./docs              # pull active project into a folder
opendocs pull --project launch --tag q2        # pull tagged docs from a named project
opendocs pull --workspace -o ./opendocs        # pull whole active workspace
opendocs pull --workspace --dry-run            # preview bulk writes
```

### Search, and answer questions about documents

```bash
opendocs search acme nda                       # every project in the active workspace
opendocs search q3 report --project finance    # one project
opendocs search board minutes --all            # every workspace you belong to
opendocs --json search acme nda --limit 50     # id, title, summary, project for each match
opendocs pull <id> --stdout                    # read a match's Markdown
```

When the user asks about their documents ("what did we agree with Acme on
payment terms?", "which reports mention the pricing change?"), answer from
the documents themselves: `opendocs --json search` with a few distinctive
words, then `opendocs pull <id> --stdout` for the likely matches, and quote
or cite the document (title and link) in the answer. Search matches the
words as one phrase in titles and summaries, not the full text, so try a
shorter phrase or another word if nothing comes back, or browse with
`opendocs list --all-projects --json`. Pull by `id`: a slug only resolves
in the active project, and search covers all of them.

**`opendocs list` is scoped to the active workspace by default.** The CLI
passes the active `workspaceId` as a filter so you only see posts in the
workspace the next `publish` will go to. Use `--all` when you need every
post across every workspace the user belongs to — this is the right mode
for "show me everything I've ever published" style asks. Each post in the
response includes `workspaceId` and `workspaceSlug`, and the top-level
response has `scope: "workspace" | "all"` plus a `workspaceSlug` that's
the active slug in the default mode or `null` in `--all` mode.

**Bulk `opendocs pull` is scoped to the active project unless `--workspace`
or `--project <slug>` is passed.** It refuses to overwrite local files by
default; add `--overwrite` only when the user explicitly wants local Markdown
replaced. Workspace pulls put Default project docs at the output root and
non-default projects under `projects/<project-slug>/`.

### Unpublish (take offline — no republish)

```bash
opendocs unpublish my-report     # by slug
opendocs unpublish abc123        # or by UUID
```

Flips the post's `isPublished` flag off. The row, slug reservation, content and version history all stick around — the post just stops being reachable at its URL. If the post was published, this frees a Free-plan document slot because the quota counts only `isPublished = true` posts. **There's no republish today:** `opendocs update` (and re-running `publish` on a file this folder already published) only works on published posts. To bring the document back, publish the file as a new document (`opendocs publish <file> --new` if this folder published it before). It gets a new URL, because the unpublished post keeps its slug.

### Change visibility without re-uploading

```bash
opendocs visibility my-report private                      # by slug
opendocs visibility abc123 workspace                       # or by UUID
opendocs visibility my-report public --confirm-public      # requires explicit flag
```

Levels: `private` (only you), `workspace` (default — workspace members), `public` (anyone with the link — workspace owner must also have enabled "Allow public documents"). This command flips the visibility bit directly — it does **not** create a new version, re-process images, or touch the Markdown. Use it when the user only wants to change who can see the post, not its content. For content changes, `opendocs update` is the right command (and it accepts `--visibility` too).

The CLI refuses `public` without `--confirm-public` as a guard — same rule as `publish`. If the user clearly asks for public, pass the flag; if they're ambiguous ("share this"), confirm first.

### Delete (permanent — irreversible)

```bash
opendocs delete my-report --yes    # required in scripts / agent invocations
opendocs delete abc123 --yes       # by UUID
opendocs delete my-report          # interactive — prompts for slug confirmation in a terminal
```

Hard-deletes the post. Removes the row, every version, all tags, and frees the slug for reuse. Audited server-side. **Cannot be undone** — there's no recycle bin, no soft-delete retention window. The post's URL becomes 404, and its quota slot returns to the workspace's `quota.documents.remaining`.

**Always pass `--yes` (or `-y`) from an agent.** Without it, the CLI refuses to fire in any non-TTY context (scripts, pipes, agent tool calls) and exits with `confirm_required` — this is the primary safety rail. Humans at a real terminal without `--yes` get an interactive "type the slug to confirm" prompt; hitting enter on anything else cancels cleanly.

**Unpublish vs delete at a glance:**

| Concern | `unpublish` | `delete` |
|---|---|---|
| Reversible? | No — there's no republish; publish the file again as a new document (new URL) | **No** |
| Keeps the slug reservation? | Yes — same slug can't be claimed by anyone else | No — frees the slug |
| Frees a quota slot? | Yes, if the post was published | Yes, if the post was published |
| Preserves version history? | Yes | No — every version is wiped |
| Right tool for… | "Take this offline" / "free the slot but keep the content" | "I'm done with this, remove it / free the slot" |

When the user says "remove this post" without qualification, **prefer `unpublish`** — it's the gentler choice: the content, version history and slug stay on the server. Don't promise it can be undone, though; there's no republish. Only use `delete` when they clearly want the content gone for good, or they need to free a slot on the Free plan and have no older posts worth keeping.

---

## Tags

Tags are plain string labels. They're the primary way to group related posts so the user (or the agent) can find them again as a set.

```bash
opendocs publish doc.md --tags "tutorial,getting-started"
opendocs publish ./docs --tags "release-q2"      # recursive folder upload
opendocs list --tag release-q2                   # retrieve the group
```

**Limits:** max 20 tags per document, max 64 chars per tag, comma-separated at the CLI.

**When publishing a batch of related documents, always include a shared `--tags` value.** This matters because the user often wants to *find the batch again later* — "show me the docs I just uploaded", "update everything from yesterday". Without a shared tag, nothing ties those posts together. Pick a tag that names the group meaningfully:

- A folder → the folder name (`--tags "api-docs"`)
- A time window → a date stamp (`--tags "notes-2026-04"`, `--tags "release-q2"`)
- A project → the project name

---

## Public visibility: require explicit confirmation

**The default visibility is `workspace`** — only workspace members can view the document. This is the right default for notes, drafts, and internal docs, and it's why the CLI doesn't require any confirmation flag for it.

**Never set `--visibility public` without explicit user consent.** Public documents are accessible to anyone on the internet with the link. If the user says "publish this doc" or "share this with the team", default to `workspace` — those phrasings are ambiguous. Before publishing publicly, ask:

> "This will make the document publicly accessible to anyone with the link. Are you sure you want it to be public?"

Only proceed with `--visibility public --confirm-public` after the user clearly says yes. The `--confirm-public` flag is a double-safety: the API itself refuses to publish publicly without it, so an accidental `--visibility public` will surface as an error rather than silently exposing the doc.

**There's also a workspace-level gate.** A workspace has an `Allow public documents` setting (default **off**) that the workspace owner controls in **Dashboard → Workspace settings**. Even after you publish a post with `--visibility public`, anonymous viewers will get a 404 until the owner enables that setting. If the user is publishing publicly for the first time and the URL doesn't load for them in an incognito window, this is almost always why — point them at workspace settings, not the post settings.

---

## Agent patterns

These compose the primitives above into the flows the user is most likely to ask for.

### "Publish this document and send me a PDF"

```bash
opendocs publish report.md --export pdf --json
```

Parse the JSON — give the user both the link (`publicUrl`, not `url`) and the local PDF path (from `export.path`).

### "Upload all the docs in this folder"

Pick a shared tag that names the group — folder name, date, project name — then one command:

```bash
opendocs publish ./docs --tags "api-docs" --json
```

Parse the `results` array for per-file URLs. Tell the user: "All N docs published. Find them again with `opendocs list --tag api-docs`." The tag is the persistent handle.

### "Publish this folder and give me PDFs I can send out"

The hero workflow — one command, URLs *and* local PDFs:

```bash
opendocs publish ./docs --export pdf --tags "release-q2" --json
```

The returned JSON has `results` (publish URLs) and `export.results` (local PDF paths, one per successful publish).

### "Update the doc I published earlier"

If it was published from this folder, edit the file and publish it again — it updates in place:

```bash
opendocs publish report.md --json         # → updated[0].action == "updated", same URL
```

Otherwise, if the user named the doc, use the slug directly:

```bash
opendocs pull my-report --stdout          # get current content (if you need it)
# ... agent edits the markdown, saves to file ...
opendocs update revised.md --post-id my-report --json
```

If the user is vague about which post, browse first:

```bash
opendocs list --json --limit 20           # find it by title/slug/recency
opendocs update revised.md --post-id <slug-or-id> --json
```

### "What did I publish recently?"

```bash
opendocs list --json --limit 50             # active workspace only
opendocs list --json --all --limit 50       # across every workspace
```

The JSON shape is `{ "posts": [...], "pagination": { "page", "limit", "total", "totalPages" }, "scope": "workspace" | "all", "workspaceSlug": "..." | null, "projectSlug": "..." | null, "otherProjects": [{ "name", "slug", "postCount" }] }` (`otherProjects` only on project-scoped lists). Each post has `id`, `title`, `slug`, `visibility`, `isPublished`, `updatedAt`, `tags`, `workspaceId`, `workspaceSlug`. If you need *every* post (not just the first page), loop until `page === totalPages` — the `--limit` cap is 100 per page, so a workspace with 250 posts needs three calls.

**Pick the scope intentionally.** "What did I publish recently?" in an account with multiple workspaces is ambiguous — use `--all` when the user doesn't specify, or when you're not confident which workspace they mean. When the user's phrasing clearly scopes to the active workspace ("show me what's in my current workspace", "list the Acme docs"), stick with the default.

If you need the full URL or the `versionNumber` of a single post, use `opendocs get <slug> --json` — that one returns more fields per post than `list` does.

### "Publish this to the <name> workspace"

When the user names a specific workspace, confirm it's active before publishing. One list call plus a conditional switch:

```bash
opendocs workspace list --json             # find the row matching the user's description
opendocs workspace use <slug> --json       # only if activeSlug isn't already <slug>
opendocs publish report.md --json
```

Match the user's phrasing against both `name` ("Acme Docs") and `slug` ("acme-docs") — users describe workspaces either way. If the user names a workspace they aren't in, `workspace use` returns `not_a_member` and you should surface the available slugs from the list rather than retrying.

---

## Error handling

When a command fails, the CLI exits non-zero and prints a structured error. In `--json` mode, the error goes to **stderr** (not stdout) as a JSON object:

```json
{ "error": "slug_taken", "message": "That slug is already in use." }
```

Common error codes and what they mean:

| Error | What it means | How to recover |
|---|---|---|
| `document_limit` (403) | The Free-plan 50-doc cap would be exceeded. The CLI pre-checks this before any network work. | Tell the user — suggest upgrading to Pro, unpublishing stale docs, or publishing only the docs that fit. Don't retry. |
| `auth_expired` (401) | API key revoked or invalid. Config is auto-cleared. | Tell the user to run `opendocs login` with a new key. |
| `onboarding_incomplete` | Account exists but username or workspace slug aren't set. | Point them at the web app to finish setup. |
| `no_workspace` | Local config missing workspaceId (rare — config corruption). | `opendocs login` will refresh it. |
| `not_a_member` (403) | The slug passed to `opendocs workspace use` isn't one the user belongs to. | Run `opendocs workspace list` to see valid slugs, then retry with one of them. |
| `not_logged_in` | No saved credentials. | Sign the user up (Setup: `opendocs login --email <email>`). Use `--anonymous` only if they don't want an account and accept a 24-hour public link. |
| `invalid_code` / `code_expired` / `too_many_attempts` | Sign-in code wrong, older than 10 minutes, or guessed wrong 5 times. | Ask for the latest code; otherwise request a new one with `opendocs login --email <email>`. |
| `signups_disabled` (403) | New accounts are temporarily closed. | Existing accounts can still sign in; tell the user. |
| `version_conflict` (409) | Someone published a newer version since your copy. | Show the user; `opendocs pull` to compare; `--force` only with their OK. |
| `invalid_claim_token` / `expired` (410) | Anonymous doc's claim token is wrong, or the 24 hours are up. | Publish it again. |
| `version_not_found` (404) | No such version number. | `opendocs history <doc>`. |
| `project_not_found` (404) | Unknown project. | `opendocs project list`, or pass a new name to `--project` on `publish` to create it. |
| `invalid_request` (400) | The request body failed validation. | The `message` names the field and the problem. |
| `doc_too_large` | File exceeds the 1 MB markdown cap. | Split the doc — this is a hard server-side limit. |
| `too_many_files` | >500 files passed in one `publish` invocation. | Split into multiple runs. |
| `no_markdown_files` | Folder input did not contain any `.md` files after skipped directories were ignored. | Check the path, or pass files explicitly. |
| `too_many_posts` | >10 postIds passed to `export`. | Split into groups of 10. |
| `invalid_format` | `--format` / `--export` wasn't `pdf` or `docx`. | Fix the flag. Note: `docx` requires Pro or Team. |
| `conflicting_options` | Flags that don't combine (e.g. `--title` with multiple files, `--stdout` with batch export). | Drop the conflicting flag. |
| `confirm_required` | A command that affects other people or every export, or deletes something (`theme set`, `team remove`, `delete`, `project delete`, `sign send`, `sign cancel`), ran without `--yes` outside a terminal. No request was made. | Ask the user; pass `--yes` only after they agree. For `sign send`, read every signer back first. |
| `plan_required` (403) | A custom export footer and integrations (Drive, signatures) need Pro or Team. Color, font, presets and logo work on every plan. | Tell the user; Free exports keep the "Made with OpenDocs" footer. Upgrade: https://opendocs.cc/dashboard/billing |
| `integration_not_connected` (409) | Google Drive or DocuSeal isn't connected to the workspace (`provider` says which). | Tell the user an owner or admin can connect it; `opendocs integrations` shows the `dashboardUrl`. |
| `destination_not_found` (404) | No Drive folder with that name. `destinations` lists the folder names. | Pick one with the user from that list. Never guess. |
| `reconnect_required` (409) | Google Drive access expired or was revoked. | An owner or admin reconnects Google Drive in the dashboard. |
| `forbidden` (403) | Your role can't do this: changing the theme, or using integrations when `settings.usableBy` is `admins`. | Tell the user; an owner or admin can do it (or change the setting). |
| `approval_required` (403) | The workspace sends signature requests from the browser; API keys can't send. | Give the user `approveUrl` on its own line and ask them to click Send there. |
| `invalid_signers` (400) | A `--signer` isn't `"Name <email>"` / `"Role=Name <email>"`, an email is invalid, a role repeats, or there are 0 or more than 10 signers. The CLI checks before any request. | Fix it with the user's real details; ask for what's missing. |
| `signer_roles_mismatch` (400) | The signers don't match the document's signature block (`roles` lists its roles). | Ask the user who signs for each role, then `--signer "Role=Name <email>"`. |
| `already_sent` (409) | The signature request isn't a draft any more (`status`). | `opendocs sign status <id>`. |
| `not_completed` (409) | Not everyone has signed, so there's no signed PDF yet. | `opendocs sign status <id>`; try again once it's `completed`. |
| `not_available` (404) | `sign download --kind draft` on a request that was already sent; the draft PDF is deleted on send. | Download the signed PDF once it's `completed` instead. |
| `confirmation_required` (400) | A direct API call to `POST /api/v1/signature-requests/:id/send` without `{ "confirm": true }`. The CLI always sends it (after `--yes`). | Add the body field, only after the user confirmed the signers. |
| `low_contrast` (400) | The brand color is too light for headings and white table-header text. | Use a darker shade of the same hue; check with `opendocs theme check <hex>`. |
| `invalid_preset` / `invalid_font` | Unknown preset or font. | `opendocs theme presets` / `opendocs theme fonts`. |
| `not_found` (404) | postId doesn't exist or isn't yours. | Double-check with `opendocs list`. Also check this isn't the public-visibility gate (see "Public visibility" above). |
| `confirm_required` | `opendocs delete` run without `--yes` in a non-TTY context (script / agent / pipe). No network call was made. | Add `--yes` (or `-y`) to confirm the deletion is intentional. |
| `confirm_public_required` | Visibility changed to `public` without `--confirm-public` (or the server enforced it). Caught pre-flight by the CLI. | Re-run with `--confirm-public` once the user has explicitly agreed to expose the post. |
| `delete_failed` (400) | `opendocs delete` reached the server but the transactional cleanup failed. The post may be partially deleted. | Re-run the delete — the transaction is idempotent. If it keeps failing, point the user at support. |
| `image_upload_failed` | The local-image upload phase failed hard (for example too many image refs in one doc). Individual missing/unsupported images are usually warnings, not this error. | Fix or remove the problematic image references and retry. Storage being unconfigured server-side is downgraded to a warning. |
| `export_failed` (502) | Converter service transient failure. | Retry — the post is still up if this happened during `--export`. |
| `plan_limit` (403) | Workspace count cap hit (Free: 1, Pro: 2 plus paid extras). | Direct the user to the dashboard to upgrade or add a Pro workspace. |
| `member_limit` (403) | Workspace member cap hit (Free: 3, Pro: 5). | Direct the user to the dashboard to upgrade or remove a member. |

---

## Important notes

- **The file must exist on disk as Markdown** (`.md`). The CLI reads it — you cannot pipe content to `publish`. If the agent wrote content in memory, save it to a file first. (The OpenDocs MCP tools take Markdown text directly.)
- **Config lives at `~/.config/opendocs/config.json`** with `0600` permissions. Never modify it by hand — use `opendocs login` / `opendocs logout`.
- **Document URLs are `opendocs.cc/<workspace-slug>/<post-slug>`.** The workspace slug is the one chosen during onboarding (shared by every doc in the workspace). The post slug is auto-derived from the title unless `--slug` is set, and is immutable after first publish. Neither segment uses the username.
- **Updates create new versions.** The URL stays stable; previous versions are preserved server-side.
- **Rate limits are generous and the CLI handles them.** If it hits one, it waits the time the server asks for and retries, so large publishes and exports slow down instead of failing. Don't add your own retry loops, and don't run many exports in parallel (an account can have 4 running at once); one `publish --export` or `export --project` call handles a whole folder.
