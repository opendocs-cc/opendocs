<!-- SPDX-License-Identifier: MIT -->

# Self-hosting OpenDocs

You can run OpenDocs on your own server, for yourself or your team. Be
prepared to do some work: you'll sign up for a few services, run a server
with Docker, and keep it updated yourself. Support is best-effort, through
[GitHub issues](https://github.com/opendocs-cc/opendocs/issues). If you'd
rather not, [opendocs.cc](https://opendocs.cc) runs it for you.

The license (FSL-1.1-MIT) lets you run it for your own company or team. It
doesn't let you offer it to others as a service that competes with
opendocs.cc. See [LICENSING.md](LICENSING.md) and
[TRADEMARKS.md](TRADEMARKS.md).

## What you get

A self-hosted instance runs in **self-hosted mode** (`SELF_HOSTED=true`):

- The web app at `https://example.com`, with the dashboard, document pages,
  projects, version history, sharing, comments, branded PDF and Word
  exports, custom domains, Google Drive and e-signatures.
- The REST API at `https://api.example.com`, which the CLI and agents use.
- The MCP server at `https://mcp.example.com/mcp`, for Claude, ChatGPT,
  Cursor and other AI apps.
- **Every feature for every account**, with nothing to pay. Billing is off.

Left out on purpose:

- **opendocs.cc's public website:** the landing page, pricing, the free
  tools and the legal pages. Visitors go straight to the dashboard (or
  sign-in). Add your own terms if you need them.
- **Anonymous publishing** (links without an account) and the free tools,
  since nobody would be reviewing reported pages.
- **The documentation site.** Your instance links to
  [docs.opendocs.cc](https://docs.opendocs.cc), which applies to it too.
- **Ads, cookie banners and analytics**, unless you add your own Plausible.

## What you'll need

| What | Why | We recommend |
| --- | --- | --- |
| A Linux server with Docker | Runs everything. 2 vCPUs and 4 GB of memory at least (8 GB is comfortable), 30 GB of disk. | Any VPS: Hetzner, DigitalOcean, Google Cloud… |
| A domain | Three names on it: `example.com`, `api.` and `mcp.`, plus `www.` | Cloudflare for DNS |
| PostgreSQL 15+ | The database | [Neon](https://neon.tech) (has a free tier and backups) |
| Email sending | Sign-in codes, invitations, password resets | [Resend](https://resend.com) |
| Object storage | Images in documents, workspace logos | [Cloudflare R2](https://developers.cloudflare.com/r2/), or any S3-compatible storage |
| Node.js 22 on your computer | To create the database tables | |

Optional: a GitHub or Google OAuth app for "Sign in with…", a Google Cloud
project for Google Drive, a [DocuSeal](https://www.docuseal.com) account for
e-signatures (each workspace connects its own), and
[Plausible](https://plausible.io) for analytics.

## 1. Set up the services

**Database.** Create a Neon project (or any PostgreSQL 15+) and copy its
connection string, with `?sslmode=require`.

**Email.** Create a Resend account, add your domain and its DNS records
there, and create an API key. Without email, people can still sign up with a
password, but sign-in codes (what the CLI and agents use), invitations and
password resets won't work.

**Storage.** Create an R2 bucket, give it a public address (a custom domain
like `assets.example.com`, or the `r2.dev` URL), and create an R2 API token
with read and write access to that bucket. For other S3-compatible storage,
set `R2_ENDPOINT` (and `R2_REGION`, `R2_FORCE_PATH_STYLE` if it needs them).

## 2. Prepare the server

Install Docker with the Compose plugin, and open ports 80 and 443. On
Ubuntu 24.04:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER   # then log out and back in
```

Then clone OpenDocs and the document converter next to each other:

```bash
git clone https://github.com/opendocs-cc/opendocs.git
git clone https://github.com/opendocs-cc/doc-converter.git
```

Compose builds the converter from `../doc-converter`, so keep the two
folders side by side.

## 3. Configure

```bash
cd opendocs/deploy
cp .env.self-hosted.example .env
chmod 600 .env
```

Edit `.env`: replace `example.com` with your domain everywhere, and fill in
the database, email and storage settings and a `BETTER_AUTH_SECRET`
(`openssl rand -hex 32`). Each setting is explained in the file.

## 4. Create the database tables

On your computer (the server doesn't need Node.js), with the same
`DATABASE_URL`:

```bash
git clone https://github.com/opendocs-cc/opendocs.git
cd opendocs
npm ci
DATABASE_URL='postgresql://…' npm run db:push
```

`db:push` compares the schema with your database, shows what it will
create or change, and asks you to confirm. Run it again after each update to
apply whatever the new version changed.

If your database only accepts connections from the server (PostgreSQL in a
container there, for example), reach it through an SSH tunnel:
`ssh -N -L 5433:127.0.0.1:5432 you@your-server`, and use port 5433 on
`127.0.0.1` in `DATABASE_URL` for `db:push`.

## 5. Point your domain at the server

Add A records (and AAAA, if your server has IPv6) for `example.com`,
`www.example.com`, `api.example.com` and `mcp.example.com`. With Cloudflare,
leave them **DNS only** (grey cloud), so Caddy can get certificates. If you
turn the proxy on later, set `TRUST_PROXY_HOPS=2`.

For workspaces' own domains (`notes.yourcompany.com`), also add
`custom.example.com`, DNS only.

## 6. Start it

```bash
cd opendocs/deploy
docker compose up -d --build
```

The first build takes 10 to 20 minutes on a small server (15 on 2 vCPUs
and 4 GB, using about 2.5 GB of memory at its peak). Caddy gets
certificates for your domains on the first visits, which can take a minute. Check that everything
is running with `docker compose ps`, and look at `docker compose logs -f`
if something isn't.

Open `https://example.com`: you'll land on the sign-in page. Sign up to
create the first account and workspace, then invite your team from the
dashboard. Anyone who can reach the site can sign up, so once everyone has
an account, set `SIGNUPS_DISABLED=true` and run `docker compose up -d`
again. That also stops invited people from creating accounts, so turn it
off while you add someone new.

## 7. Connect your tools

**The CLI and agent skill.** Use the official CLI and point it at your
server once. It remembers the server, so every later command uses it:

```bash
npx @opendocs.cc/cli login --api-url https://api.example.com --email you@example.com
npx @opendocs.cc/cli publish notes.md
```

Without email set up, sign in through the browser instead: `--browser` in
place of `--email …` opens a page on your instance where you approve the
CLI.

The setup prompt on your dashboard ("Connect your agent") already includes
your server's address, so you can also paste it into Claude Code, Cursor or
Codex. Your instance serves the agent files (`/skill.md`, `/llms.txt`,
`/install.sh`) with its own addresses too.

**The MCP server** (`https://mcp.example.com/mcp`):

- Claude (web, desktop, mobile): Settings, Connectors, Add custom connector,
  and paste the URL.
- Claude Code: `claude mcp add --transport http --scope user opendocs https://mcp.example.com/mcp`
- ChatGPT: add it as a custom connector (developer mode). The "OpenDocs.cc"
  app in ChatGPT's directory connects to opendocs.cc, not to your server.
- Other apps: `OPENDOCS_MCP_URL=https://mcp.example.com/mcp npx @opendocs.cc/cli mcp add`

Each app signs in through your instance the first time.

**The browser extension** (optional). The one in the Chrome Web Store
publishes to opendocs.cc. To publish to your server, build your own from
[opendocs-cc/opendocs-extension](https://github.com/opendocs-cc/opendocs-extension)
with your addresses (see its README for the `WXT_OPENDOCS_*` settings), load
it unpacked in Chrome, and add its extension ID to `EXTENSION_IDS` in
`.env`, then run `docker compose up -d` again.

## Updating

```bash
cd opendocs && git pull
cd ../doc-converter && git pull
```

Then run `npm run db:push` from your computer as in step 4, and rebuild:

```bash
cd ../opendocs/deploy
docker compose up -d --build
```

Check the release notes for anything that needs a new setting.

## Backups

- **The database** is everything that matters. Neon keeps point-in-time
  history; with your own PostgreSQL, back it up with `pg_dump` on a schedule.
- **The storage bucket** holds uploaded images and logos.
- **`deploy/.env`**: keep a copy somewhere safe. Never change
  `INTEGRATIONS_ENCRYPTION_KEY` or `BETTER_AUTH_SECRET` once set: saved
  integrations and sign-ins depend on them.

## Good to know

- **Links** look like `https://example.com/<workspace>/<document>`, or a
  workspace's own domain once it connects one.
- **Without storage**, documents can't include local images or uploaded
  files: the CLI skips them with a warning. Images linked from the web
  still work.
- **Exports** run on the server (LibreOffice in the converter container).
  One conversion at a time by default; on a bigger server, raise
  `CONVERT_MAX_WORKERS` and the converter's limits in
  `docker-compose.yml`.
- **Billing** stays off. `BILLING_MODE` and the Paddle settings are for
  opendocs.cc.
- **Turning self-hosted mode off** (`SELF_HOSTED=false`) brings back the
  public website and anonymous publishing, which are opendocs.cc's. You
  won't want that.
