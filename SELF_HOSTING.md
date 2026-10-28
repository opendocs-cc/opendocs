<!-- SPDX-License-Identifier: MIT -->

# Self-hosting OpenDocs

You can run OpenDocs on your own server, for yourself or your team. Be
prepared to do some work: you'll sign up for a few services, run a server
with Docker, and keep it updated yourself. Support is best-effort, through
[GitHub issues](https://github.com/opendocs-cc/opendocs/issues). If you'd
rather not, [opendocs.cc](https://opendocs.cc) runs it for you.

The code is MIT-licensed, so you can run it for anything. The OpenDocs name
and logo aren't covered by that license: if you offer your instance to people
outside your company, see [TRADEMARKS.md](TRADEMARKS.md).

## Let an AI agent set it up

This guide is written so an agent can follow it. In Claude Code, Codex or
another agent that can run commands on your computer, paste:

```text
Set up a self-hosted OpenDocs for me. Follow
https://github.com/opendocs-cc/opendocs/blob/main/SELF_HOSTING.md,
including "Notes for AI agents" and the "Configuration reference".
Ask me for what you need before you change anything.
```

It will ask you for:

- **A server:** SSH access to a Linux machine with 2 vCPUs and 4 GB of
  memory or more, and ports 80 and 443 open.
- **A domain** and access to its DNS (or you add the records it gives you).
- **Email** (optional, recommended): a [Resend](https://resend.com) API key
  for a domain you've verified there. Without it, people sign up with a
  password and the CLI signs in through the browser.
- **File storage** (optional): an R2 or other S3-compatible bucket and its
  keys, for images in documents and workspace logos.

Everything else has a default. The database runs on the same server unless
you'd rather use a hosted one.

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
| PostgreSQL 15+ | The database | Built in (a container on the server), or [Neon](https://neon.tech) (a free tier, with backups) |
| Email sending | Sign-in codes, invitations, password resets | [Resend](https://resend.com) |
| Object storage | Images in documents, workspace logos | [Cloudflare R2](https://developers.cloudflare.com/r2/), or any S3-compatible storage |
| Node.js 22 on your computer | To create the database tables | |

Optional: a GitHub or Google OAuth app for "Sign in with…", a Google Cloud
project for Google Drive, a [DocuSeal](https://www.docuseal.com) account for
e-signatures (each workspace connects its own), and
[Plausible](https://plausible.io) for analytics.

## 1. Set up the services

**Database.** Two options:

- **Built in** (the default in `.env.self-hosted.example`): PostgreSQL runs
  in a container on the same server (`COMPOSE_PROFILES=db`). Nothing to sign
  up for; you back it up yourself (see [Backups](#backups)).
- **Hosted:** create a Neon project (or any PostgreSQL 15+) and copy its
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
(`openssl rand -hex 32`). Each setting is explained in the file, and the
[Configuration reference](#configuration-reference) lists them all with
their defaults.

## 4. Create the database tables

`db:push` creates the tables from the schema. It runs on your computer (the
server doesn't need Node.js):

```bash
git clone https://github.com/opendocs-cc/opendocs.git
cd opendocs
npm ci
```

**With the built-in database,** start it on the server first
(`cd opendocs/deploy && docker compose up -d db`). It only listens on the
server itself, so open an SSH tunnel from your computer and leave it running:

```bash
ssh -N -L 5433:127.0.0.1:5432 you@your-server
```

Then, in another terminal, with the password from `POSTGRES_PASSWORD`:

```bash
DATABASE_URL='postgresql://opendocs:PASSWORD@127.0.0.1:5433/opendocs' npm run db:push
```

**With a hosted database,** use its connection string directly:

```bash
DATABASE_URL='postgresql://…' npm run db:push
```

`db:push` compares the schema with your database, shows what it will
create or change, and asks you to confirm (`npm run db:push -- --force` skips
the question, which is fine on a new, empty database). Run it again after each update to
apply whatever the new version changed.

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
  history. The built-in database is yours to back up: run this daily (from
  `deploy/`, with cron for example) and copy the files off the server.

  ```bash
  docker compose exec -T db pg_dump -U opendocs opendocs | gzip > ~/opendocs-$(date +%F).sql.gz
  ```
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

## Notes for AI agents

If you're an agent setting this up for someone, follow the numbered steps
above. These notes cover what a person would otherwise decide or check by
eye.

**Ask first, then act.** Ask for the server (SSH user and host), the domain
and whether you can edit its DNS, and whether they have email (Resend) and
storage (R2 or S3) to connect. Use the defaults in the
[Configuration reference](#configuration-reference) for everything else,
and leave optional services off unless they ask for them.

**In this order:**

1. **Check the server** over SSH: `nproc` (2 or more), `free -g` (4 GB or
   more; with less, add swap first), `df -h /` (30 GB free) and
   `docker compose version`. Install Docker as in step 2 if it's missing.
2. **Clone** both repositories side by side in the SSH user's home folder
   (step 2).
3. **Write `deploy/.env`** from `.env.self-hosted.example` (step 3):
   replace every `example.com`, generate `BETTER_AUTH_SECRET`
   (`openssl rand -hex 32`) and `POSTGRES_PASSWORD` (`openssl rand -hex 24`,
   also in `DATABASE_URL`), and, only if they want Google Drive or
   e-signatures, `INTEGRATIONS_ENCRYPTION_KEY` (`openssl rand -base64 32`).
   Generate secrets on the server and write them straight into the file
   rather than printing them. Then `chmod 600 deploy/.env`.
4. **DNS** (step 5). Before starting, check that each name points at the
   server: `dig +short example.com www.example.com api.example.com
   mcp.example.com`. Caddy can't get certificates until they do.
5. **Create the tables** (step 4). With the built-in database:
   `docker compose up -d db`, wait until `docker compose ps db` says
   `healthy`, open the SSH tunnel, then `npm run db:push -- --force`.
6. **Start it** (step 6): `docker compose up -d --build`. The first build
   takes 10 to 20 minutes; if your SSH session might drop, run it with
   `nohup … > build.log 2>&1 &` and watch the log.
7. **Verify.** Each of these should succeed:

   ```bash
   curl -fsS https://api.example.com/healthz
   curl -fsS https://api.example.com/healthz/converter
   curl -fsS https://mcp.example.com/healthz
   curl -fsS -o /dev/null -w "%{http_code}\n" https://example.com/login   # 200
   ```

   If one doesn't, look at `docker compose ps` and
   `docker compose logs --tail 50 <service>`.
8. **Hand over.** The person opens `https://example.com` and signs up: the
   first account creates their workspace. Give them the CLI command and the
   MCP address from step 7, and suggest `SIGNUPS_DISABLED=true` once their
   team has accounts.

**Never:**

- change `BETTER_AUTH_SECRET` or `INTEGRATIONS_ENCRYPTION_KEY` once the
  instance is in use: sign-ins and saved integrations depend on them;
- publish the API's ports or the database beyond the server. Caddy is the
  only way in; if the API ever becomes reachable without it, set
  `TRUST_PROXY_HOPS=0`;
- commit `deploy/.env` or paste its secrets into the conversation;
- set `SELF_HOSTED=false`: that's opendocs.cc's public website;
- run `db:push` with `--force` on a database that already has data. Run it
  without, and show the person what it will change.

## Configuration reference

Every setting goes in `deploy/.env`. After a change, run
`docker compose up -d` to apply it; settings starting with `NEXT_PUBLIC_`
are built into the web app, so use `docker compose up -d --build web` for
those. `<domain>` is your domain, such as `example.com`.

### Your instance

| Setting | Default | What it does |
| --- | --- | --- |
| `OPENDOCS_DOMAIN` | required | Your domain. Caddy serves the web app on it, the API on `api.`, the MCP server on `mcp.`, and redirects `www.` |
| `SELF_HOSTED` | `true` | Self-hosted mode: no public website, anonymous publishing or free tools, and every feature unlocked. Keep it `true` |
| `BILLING_MODE` | `off` | Keep `off`: billing (Paddle) is opendocs.cc's |
| `BETTER_AUTH_URL` | required, `https://<domain>` | The web app's address, used for sign-in, links and as the MCP server's sign-in issuer |
| `API_URL`, `NEXT_PUBLIC_API_URL` | required, `https://api.<domain>` | The API's address |
| `MCP_RESOURCE_URL` | required, `https://mcp.<domain>/mcp` | The MCP server's address, which AI apps connect to |
| `CORS_ORIGINS` | required, `https://<domain>` | Browser origins allowed to call the API, comma-separated |
| `AUTH_COOKIE_DOMAIN` | required, `.<domain>` | Shares the sign-in between the web app and the API |
| `BETTER_AUTH_SECRET` | required, generate | Signs sessions: `openssl rand -hex 32`. Never change it once people use the instance |

### Database

| Setting | Default | What it does |
| --- | --- | --- |
| `COMPOSE_PROFILES` | `db` | `db` runs the built-in PostgreSQL. Leave it out with a hosted database |
| `POSTGRES_PASSWORD` | generate | The built-in database's password: `openssl rand -hex 24`. Only with the built-in database |
| `DATABASE_URL` | required | Built in: `postgresql://opendocs:<POSTGRES_PASSWORD>@db:5432/opendocs`. Hosted: its connection string, with `?sslmode=require` |

### Email

| Setting | Default | What it does |
| --- | --- | --- |
| `RESEND_API_KEY` | empty: no email | Sign-in codes (how the CLI and agents sign in by default), invitations and password resets |
| `EMAIL_FROM` | set it with email | The sender, on a domain verified in Resend, such as `OpenDocs <noreply@example.com>`. Unset, it's opendocs.cc's address, which Resend won't send from |

### File storage

| Setting | Default | What it does |
| --- | --- | --- |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | empty: no uploads | Images in documents and workspace logos. `R2_PUBLIC_URL` is the bucket's public address |
| `R2_ENDPOINT`, `R2_REGION`, `R2_FORCE_PATH_STYLE` | empty | Any S3-compatible storage instead of R2 (then `R2_ACCOUNT_ID` isn't needed). `R2_FORCE_PATH_STYLE=true` for MinIO |
| `EXPORT_CACHE_ENABLED` | `false` | Keeps rendered PDF and Word files in storage, so repeat exports are instant. Needs storage, and a lifecycle rule that deletes `exports/` after 90 days |

### Sign-in and access

| Setting | Default | What it does |
| --- | --- | --- |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | empty: off | "Sign in with GitHub". Callback URL: `https://<domain>/api/auth/callback/github` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | empty: off | "Sign in with Google". Callback URL: `https://<domain>/api/auth/callback/google` |
| `SIGNUPS_DISABLED` | `false` | `true` stops new sign-ups, invited people included; turn it off while you add someone |
| `UNLOCK_ALL_FEATURES` | follows `SELF_HOSTED` | Every feature for every account. `false` puts everyone on the Free plan's limits |

### Integrations

| Setting | Default | What it does |
| --- | --- | --- |
| `INTEGRATIONS_ENCRYPTION_KEY` | empty: integrations off | Encrypts saved Google Drive and e-signature connections: `openssl rand -base64 32`. Never change it once set. For e-signatures (DocuSeal), each workspace enters its own credentials |
| `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` | empty: no Drive | A Google OAuth client (Web application) with the redirect URI `https://<domain>/dashboard/integrations/google-drive/callback` and the `drive.file` scope |
| `GOOGLE_PICKER_API_KEY`, `GOOGLE_CLOUD_PROJECT_NUMBER` | empty | The Drive folder picker: an API key restricted to the Picker API, and the Cloud project's number |

### Domains and network

| Setting | Default | What it does |
| --- | --- | --- |
| `CUSTOM_DOMAIN_CNAME_TARGET` | `custom.<domain>` | Where workspaces point their own domains with a CNAME. Add an A record for it |
| `CUSTOM_DOMAIN_IPV4` | empty | Your server's IPv4 address, to also offer root domains (A records). Empty: subdomains only |
| `TRUST_PROXY_HOPS` | `1` | How many proxies in front of the API to trust for the client's address. `2` with Cloudflare's proxy on, `0` if the API is reachable without Caddy |

### Other

| Setting | Default | What it does |
| --- | --- | --- |
| `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_REGISTRATION`, `LEGAL_ENTITY_COUNTRY` | empty | Your company, named on the legal pages |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | empty: no analytics | [Plausible](https://plausible.io) analytics for your instance |
| `EXTENSION_IDS` | empty | Your own build of the browser extension, by ID (comma-separated) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID`, `TELEGRAM_WEBHOOK_SECRET` | empty: off | A Telegram bot that tells you when someone signs up, and answers `/stats` |
| `OPENDOCS_DOCS_SITE` | `off` | The documentation site. Leave it off: your instance links to docs.opendocs.cc |
| `DOC_CONVERTER_BUILD_CONTEXT` | `../../doc-converter` | Where Compose finds the converter's checkout, relative to `deploy/` |

Set in `docker-compose.yml` instead: the converter's workers and limits
(`CONVERT_MAX_WORKERS=1`, one CPU, 1500 MB; the file has sizing notes for
bigger servers) and the API's internal port for Caddy (`INTERNAL_PORT`,
4001).
