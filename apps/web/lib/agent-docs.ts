/**
 * What agents get from `curl https://opendocs.cc/docs` (or any request that
 * doesn't ask for HTML): a compact, current map of the product and API.
 * Humans are redirected to docs.opendocs.cc instead. Keep this in step
 * with the CLI's `opendocs agent` guide and public/skill.md. A self-hosted
 * instance serves its own addresses (withInstanceUrls).
 */

import { withInstanceUrls } from "@opendocs/shared/config/instance";

export const AGENT_DOCS_MARKDOWN = withInstanceUrls(`# OpenDocs — agent mode

product: OpenDocs
web: https://opendocs.cc
api_base: https://api.opendocs.cc
skill_url: https://opendocs.cc/skill.md
openapi_url: https://opendocs.cc/openapi.json
human_docs: https://docs.opendocs.cc
agent_quickstart: https://docs.opendocs.cc/getting-started/agent-quickstart.md
errors: https://docs.opendocs.cc/errors

## Summary
OpenDocs publishes Markdown to shareable links (private to a workspace by default) and exports it to PDF or DOCX.

## Install
- With npm (Node 22+): \`npx skills add opendocs-cc/skills --skill opendocs -g -y\` — installs the skill (SKILL.md + scripts/opendocs.sh). Then \`npm install -g @opendocs.cc/cli\` for the full CLI. If the installer ends with "PromptScript does not support global skill installation", ignore it: it's a known installer bug that only affects PromptScript.
- Without Node.js: \`curl -fsSL https://opendocs.cc/install.sh | bash\` — installs the same skill into ~/.claude/skills/opendocs; use \`bash ~/.claude/skills/opendocs/scripts/opendocs.sh\` (curl + jq) wherever this guide says \`opendocs\`.
- Already have the CLI? \`opendocs agent --install\` writes the skill; \`opendocs agent\` prints a short guide.

## Set up (do this first)
Sign the user up before their first publish. An account is free for up to 50 documents and is what they want by default: links stay up, stay private to their workspace, can be updated in place and exported as PDF.

1. Ask the user for their email, then run \`opendocs login --email <email> --json\`. A 6-digit code is emailed.
2. Ask the user to paste the code, then run \`opendocs login --email <email> --code <code> --json\`. New emails get an account, workspace and API key automatically. Save nothing yourself; the key is stored for you.
3. Publish: \`opendocs publish report.md --json\`.

Only if the user doesn't want an account yet: \`opendocs publish report.md --anonymous --json\` returns a link anyone can open for 24 hours plus a \`claimUrl\`. Afterwards, offer to sign them up so it's kept. Tell the user it expires. Logging in from the same folder later claims it automatically.

## When to use OpenDocs
- The user asks to publish, share, host, or send a Markdown document, report, plan, spec, notes or docs folder.
- The user wants a PDF or Word/DOCX version of Markdown (\`--export pdf\` or \`opendocs export\`).
- The user wants to edit published docs locally and re-publish (\`opendocs clone\`, \`opendocs status\`, \`opendocs publish .\`).

## Rules
- Default visibility is \`workspace\`. Only use \`--visibility public --confirm-public\` when the user explicitly asks for a public page.
- To give one outside person access, use \`opendocs share <doc> <email>\` rather than making it public.
- Re-publishing a file this folder already published updates the same document. Don't create copies.
- Keep things organized: projects are like git branches (one per client, repo, product or initiative). Before publishing check \`opendocs project current --json\` and \`opendocs project list --json\` (recentTitles). Route docs to the matching project with \`--project\`; when a new ongoing topic starts, ask before creating a project unless \`opendocs whoami --json\` shows \`organize: "auto"\` (create it and say so) or \`"off"\`. In a repo dedicated to one topic, \`opendocs project link "<name>"\` once. No projects for one-off docs.
- Adding a teammate emails them an invitation they accept: confirm email + role first, then \`opendocs team invite <email>\`. When login shows \`pendingInvitations\`, ask before \`opendocs team join\`.
- The export theme (brand color, font, logo, footer) applies to every PDF/DOCX in the workspace: propose a preset from \`opendocs theme presets\` (or a dark color + font), get the user's OK, then \`opendocs theme set ... --yes\`. Brand colors need 4.5:1+ contrast on white (\`opendocs theme check <hex>\`).
- On \`version_conflict\`, tell the user someone else published a newer version; overwrite with \`--force\` only if they agree.
- Send \`X-OpenDocs-Client: <your agent, e.g. claude-code>\` when calling the API directly. The CLI does this for you.

## What to tell the user
- Put each URL on its own line with nothing after it.
- Say who can open it: workspace members, only them, named people, or anyone with the link for 24 hours (anonymous).
- For anonymous docs, give the claim URL exactly as returned.

## CLI commands
- Auth: \`login --email <e> [--code <c>]\`, \`login --key od_live_...\`, \`whoami\`, \`logout\`
- Publish: \`publish <files|folder> [--project "Name"] [--tags a,b] [--visibility private|workspace|public --confirm-public] [--export pdf|docx] [--anonymous] [--new] [--force]\`
- Sync: \`clone [dir] [--project p]\`, \`status\`, \`pull <doc> [-o file] [--version n]\`
- History: \`history <doc>\`, \`rollback <doc> <version>\`
- Organize: \`project list|create|use|rename|delete\`, \`move <doc> --project p\`, \`list [--project p | --all-projects | --all]\`
- Share: \`share <doc> [emails and @domains] [--remove]\`, \`visibility <doc> <level>\`
- Team: \`team invite <emails> [--role admin]\`, \`team list\`, \`team resend|revoke <email>\`, \`team role <email> <role>\`, \`team remove <email> --yes\`, \`team invitations\`, \`team join [ws]\`, \`team decline <ws>\`, \`team leave --yes\`, \`team auto-join [add|remove <domain>]\`, \`workspace create <name>\`
- Export theme: \`theme\`, \`theme presets\`, \`theme fonts\`, \`theme check <hex>\`, \`theme set [--preset id] [--color hex] [--font name] [--logo-in-exports on|off] --yes\`, \`theme footer [...] --yes\`, \`theme logo <file> --yes\`
- Organize: \`project list|current|link <name>|unlink\`, \`config set organize ask|auto|off\`
- Export: \`export <docs...> -f pdf|docx\`, \`export --project p -f pdf\`
- Remove: \`unpublish <doc>\`, \`delete <doc> --yes\`
- Every command accepts \`--json\`. \`<doc>\` is a post ID, slug, or a local .md file this folder published.

## API (Authorization: Bearer od_live_...)
- POST /api/v1/auth/code/request {email} — no auth; emails a sign-in code
- POST /api/v1/auth/code/verify {email, code, keyName} — no auth; returns apiKey, workspace
- POST /api/v1/anonymous/publish {markdown, title?} — no auth; 24-hour link + claimToken
- PUT /api/v1/anonymous/:id {markdown, claimToken} — no auth
- POST /api/v1/anonymous/claim {claimToken, workspaceId}
- GET /api/v1/me — user, active workspace, document quota
- GET|POST /api/v1/workspaces — list or create workspaces
- POST /api/v1/publish {markdown, workspaceId, projectSlug?, visibility?, tags?}
- POST /api/v1/publish/batch {documents: [...]} — up to 25
- GET /api/v1/posts?workspaceId=&projectId=&tag= — includes versionNumber
- GET /api/v1/posts/:idOrSlug, GET /api/v1/posts/:idOrSlug/raw
- POST /api/v1/posts/:idOrSlug/update {markdown, workspaceId, baseVersionNumber?} — 409 version_conflict when stale; unchanged:true when identical
- GET /api/v1/posts/:idOrSlug/versions, GET .../versions/:n/raw, POST .../versions/:n/restore
- POST /api/v1/posts/:idOrSlug/move {projectSlug}
- GET|POST|DELETE /api/v1/posts/:idOrSlug/share {emails, domains}
- POST /api/v1/posts/:idOrSlug/visibility {visibility, confirmPublic}
- POST /api/v1/posts/:idOrSlug/export/pdf|docx, POST /api/v1/posts/batch/export
- POST /api/v1/workspace/team/invite {email, role, workspaceId}; GET /api/v1/workspace/team(/invitations)?workspaceId=; PATCH/DELETE .../members/:id
- GET /api/v1/workspace/branding?workspaceId= (theme + presets + fonts + guidelines); PATCH /api/v1/workspace/branding {workspaceId, preset?, brandColor?, font?, showLogoInExports?, footer?}
- GET /api/v1/me/invitations — invites to you + joinable (domain auto-join); POST /api/v1/invitations/:id/accept|decline; POST /api/v1/workspaces/:slug/join; POST /api/v1/workspace/leave
- GET|POST|DELETE /api/v1/workspace/auto-join {workspaceId, domain}
- GET /api/v1/projects?workspaceId= — includes recentTitles per project
- Errors are JSON: {error, message, docs_url}. Read \`message\`; it says how to fix the call.

## Limits
- 1 MB Markdown per doc (512 KB anonymous); 25 docs per batch request; 10 per export batch.
- Free: 50 published docs per workspace, PDF export only. Pro/Team: unlimited, DOCX.
`);
