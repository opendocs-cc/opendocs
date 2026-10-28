<!-- SPDX-License-Identifier: MIT -->

# OpenDocs

The source code of [opendocs.cc](https://opendocs.cc): a place for the
Markdown your AI agents write. Publish a file and get a link your team can
open, export it as a PDF or Word file in your brand, and publish again to
update the same link.

OpenDocs is **open source under the [MIT license](LICENSE)**: use it, change
it, host it and build on it. See [License](#license).

## Self-hosting

Run your own OpenDocs for your team, on one Linux server with Docker
Compose:

- **Every feature for every account**, with billing off: projects, version
  history, sharing, comments, branded PDF and Word exports, custom domains,
  Google Drive and e-signatures.
- **The same tools connect to it.** The CLI and the agent skill
  (`opendocs login --api-url https://api.example.com`), and Claude, ChatGPT
  and other AI apps through its own MCP server.
- **What you need:** a server with 4 GB of memory and a domain. PostgreSQL
  can run on the same server, or use a hosted one such as Neon. Email
  (Resend) and file storage (R2 or any S3-compatible service) are optional
  but recommended.

It takes some work: you set up those services and keep the server updated,
and support is best-effort. **[SELF_HOSTING.md](SELF_HOSTING.md)** walks
through it step by step, and it's written so an AI agent such as Claude Code
or Codex can do the setup for you. It ends with every setting and its
default.

If you self-host OpenDocs and it saves you time, you can support its
development on [Ko-fi](https://ko-fi.com/patrekurm).

## What's in here

```
apps/
  web/        Next.js: the website, dashboard and document pages
  api/        Express: the REST API, sign-in, billing webhooks
  mcp/        The MCP server (mcp.opendocs.cc) for Claude, ChatGPT and other AI apps
  docs/       Docusaurus: docs.opendocs.cc
packages/
  shared/     Database schema, the Markdown pipeline and services used by web and api
  ads/        Placeholder for the optional ads add-on (does nothing here)
deploy/       Docker Compose and Caddy setup used for opendocs.cc
scripts/      Maintenance scripts
```

Related repositories:

| Repository | What | License |
| --- | --- | --- |
| [opendocs-cc/opendocs-cli](https://github.com/opendocs-cc/opendocs-cli) | The `opendocs` CLI and the agent skill | MIT |
| [opendocs-cc/doc-converter](https://github.com/opendocs-cc/doc-converter) | Markdown to PDF and Word (needed for exports) | MIT |
| [opendocs-cc/opendocs-extension](https://github.com/opendocs-cc/opendocs-extension) | Browser extension for ChatGPT, Claude and Gemini | MIT |
| [opendocs-cc/skills](https://github.com/opendocs-cc/skills) | Agent skills and the Claude Code plugin | MIT |

## Running it locally

You need Node.js 22 and PostgreSQL. Exports (PDF and Word) also need the
[converter](https://github.com/opendocs-cc/doc-converter) running on port
8080 (its README shows how); everything else works without it.

```bash
npm install

# Settings: the API reads apps/api/.env, the web app apps/web/.env.local.
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local
# Set DATABASE_URL and BETTER_AUTH_SECRET (the same in both files).

# Create the tables (drizzle-kit reads DATABASE_URL from the environment)
DATABASE_URL=postgres://... npm run db:push

# Web on :3000, API on :4000, docs on :3001
npm run dev
```

`db:push` creates the tables from `packages/shared/src/db/schema.ts`. The SQL
files in `drizzle/` change existing databases; they're idempotent and applied
by hand (`psql -f`), in order.

Every other setting in `.env.example` is optional and explained there: email
(Resend), file storage (Cloudflare R2), billing (Paddle), sign-in with
GitHub or Google, Google Drive and e-signatures. Without email, sign up with a
password; sign-in codes and invitations need it.

Without billing, every account is on the Free plan's limits. Set
`UNLOCK_ALL_FEATURES=true` to give everyone everything on the Team plan
instead. To run it as a self-hosted instance (no marketing site, see
[SELF_HOSTING.md](SELF_HOSTING.md)), set both `SELF_HOSTED=true` and
`NEXT_PUBLIC_SELF_HOSTED=true`, which also unlocks everything.

The MCP server isn't part of `npm run dev`. To try it, set
`MCP_RESOURCE_URL=http://localhost:4100/mcp` in both files above, then:

```bash
cat > apps/mcp/.env <<'EOF'
PORT=4100
MCP_RESOURCE_URL=http://localhost:4100/mcp
API_INTERNAL_URL=http://localhost:4000
PUBLIC_WEB_URL=http://localhost:3000
OAUTH_ISSUER=http://localhost:3000/api/auth
EOF
npm run dev --workspace=@opendocs/mcp   # http://localhost:4100/mcp
```

Tests: `npm test` runs the API suite. It starts a throwaway PostgreSQL in
Docker, so Docker needs to be running.

## Contributing

Bug reports, ideas and pull requests are welcome; for anything bigger than a
small fix, open an [issue](https://github.com/opendocs-cc/opendocs/issues)
first. See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues go to
[SECURITY.md](SECURITY.md), not public issues.

## License

- Everything in this repository is under the [MIT license](LICENSE).
  [LICENSING.md](LICENSING.md) covers the related repositories, which are MIT
  too.
- "OpenDocs" and the OpenDocs logo are trademarks of Contrarian Capital ehf.
  The license doesn't cover them; see [TRADEMARKS.md](TRADEMARKS.md).
- Third-party code and assets are listed in
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
