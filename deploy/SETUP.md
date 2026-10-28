# Running the full stack (Ubuntu 22.04 / 24.04)

[`SELF_HOSTING.md`](../SELF_HOSTING.md) is the guide for running OpenDocs for
one team. This page covers everything else the stack in `deploy/` can do, as
it runs at opendocs.cc: custom domains, billing, the MCP server and the docs
site, on one server. The examples use `example.com`; replace it with your
domain.

## 1. Initial server setup

SSH into your fresh Ubuntu instance:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Set up firewall (allow SSH, HTTP, HTTPS only)
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp  # HTTP/3
sudo ufw enable

# Disable password auth (if not already)
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# Enable automatic security updates
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

## 2. Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Add your user to the docker group (log out and back in after)
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt install -y docker-compose-plugin

# Verify
docker --version
docker compose version
```

## 3. Clone the repo and configure

```bash
# Clone
git clone https://github.com/opendocs-cc/opendocs.git
git clone https://github.com/opendocs-cc/doc-converter.git
cd opendocs/deploy

# Create your .env file from the example
cp .env.example .env
nano .env  # fill in your values
```

### Required values

| Variable | Where to get it |
|----------|----------------|
| `DATABASE_URL` | A PostgreSQL connection string, from a hosted provider such as [Neon](https://neon.tech) or your own server |
| `BETTER_AUTH_SECRET` | Run `openssl rand -hex 32` to generate |
| `BETTER_AUTH_URL` | Your web app URL, e.g. `https://example.com` |
| `AUTH_COOKIE_DOMAIN` | Your domain with a leading dot, e.g. `.example.com` |
| `API_URL` | e.g. `https://api.example.com` |
| `NEXT_PUBLIC_API_URL` | The same as `API_URL` |
| `CORS_ORIGINS` | Your web app URL, e.g. `https://example.com` |

### Optional integrations

| Variable | Where to get it |
|----------|----------------|
| `GITHUB_CLIENT_ID/SECRET` | [GitHub Developer Settings](https://github.com/settings/developers) — callback path `/api/auth/callback/github` |
| `GOOGLE_CLIENT_ID/SECRET` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) — callback path `/api/auth/callback/google` |
| `RESEND_API_KEY` | [Resend Dashboard](https://resend.com) — needed for sign-in codes and team invite emails |
| `EMAIL_FROM` | Sender address for transactional emails (e.g. `OpenDocs <noreply@example.com>`) |
| `SIGNUPS_DISABLED` | Set to `true` to disable new registrations (default: `false`) |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Your domain for Plausible analytics (e.g. `example.com`) |
| `NEXT_PUBLIC_AD_PIXELS_ENABLED` + `AD_PIXELS_ENABLED` + `ADS_DIR` | The optional ads add-on: pixels in the browser and server-side conversion events, after consent. Off by default, and the placeholder add-on in `packages/ads` does nothing. `ADS_DIR` points the web and API builds at a replacement add-on; see [`packages/ads/README.md`](../packages/ads/README.md). |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_OWNER_ID` + `TELEGRAM_WEBHOOK_SECRET` | Owner notifications: a bot from [@BotFather](https://t.me/BotFather) messages your Telegram account when someone signs up or starts paying, and answers `/stats`. `TELEGRAM_OWNER_ID` is your numeric user id; the webhook secret is any random string. Open the bot and press **Start** once, or Telegram won't let it message you. The API registers the webhook on startup. |
| `BILLING_MODE` + `PADDLE_*` | Paddle billing. Default `off` hides all billing UI. Set to `sandbox` or `production` with the matching credentials from [vendors.paddle.com](https://vendors.paddle.com). Server-side Paddle vars are read by both `web` and `api` from `deploy/.env`; changing `NEXT_PUBLIC_PADDLE_*_CLIENT_TOKEN` still requires a web rebuild because it is baked into the browser bundle. |
| `UNLOCK_ALL_FEATURES` | `true` gives every account everything on Team (creator access) with nothing to pay, for a self-hosted instance (on by default with `SELF_HOSTED=true`; `false` turns it off). Only works while `BILLING_MODE=off`; read on every request, so turning it off puts everyone back on their own plan. |
| `OPENDOCS_DOMAIN` + `SELF_HOSTED` | The instance's domain (Caddy serves it, `api.`, `mcp.` and, with `OPENDOCS_DOCS_SITE=on` and `COMPOSE_PROFILES=docs`, `docs.`) and whether it's a self-hosted instance for one team. A service for many teams, like opendocs.cc, sets `SELF_HOSTED=false`. See [`../SELF_HOSTING.md`](../SELF_HOSTING.md). |
| `PADDLE_*_FOUNDER_DISCOUNT_ID` + `FOUNDER_OFFER_ENDS_AT` (+ optional `FOUNDER_OFFER_STARTS_AT`) | Founding-member price: Pro at half price, locked in while subscribed, for anyone who subscribes between the start date (if set) and the deadline. Create the discount in Paddle first (percentage 50, recurring with no maximum, restricted to the two Pro plan prices, expiring at the deadline); see `.env.example`. Read at runtime, no rebuild. Keep the discount id set after the deadline. |

### Client addresses behind the proxy (`TRUST_PROXY_HOPS`)

The API's rate limits (sign-in codes, the free tools, anonymous publishing,
exports) and anonymous-page reports key on the client's address, which it
reads from the `X-Forwarded-For` header set by the reverse proxy.
`TRUST_PROXY_HOPS` is how many proxies in front of the API it trusts that
header from, and it defaults to `1`: right for this stack, where Caddy is
the only way in (the `api` service publishes no port) and overwrites the
header with the address it accepted the connection from.

**If the API is ever exposed without a reverse proxy** (its port published,
or run outside Compose and reachable directly), **set `TRUST_PROXY_HOPS=0`.**
With the default and no proxy, a client chooses its own address by sending
an `X-Forwarded-For` header and gets a fresh rate-limit bucket on every
request. Behind two proxies (for example Cloudflare's proxy turned on in
front of Caddy, with Cloudflare's ranges in Caddy's `trusted_proxies`), set
it to `2`.

## 4. Point DNS to your server

In your DNS provider, add these A records:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | @ | YOUR_SERVER_IP | DNS only |
| A | www | YOUR_SERVER_IP | DNS only |
| A | api | YOUR_SERVER_IP | DNS only |
| A | docs | YOUR_SERVER_IP | DNS only |
| A | mcp | YOUR_SERVER_IP | DNS only |
| A | custom | YOUR_SERVER_IP | DNS only |

The `www` record is needed so Caddy can receive and redirect `www.example.com` to `example.com`.

`custom.example.com` is where workspaces point their custom domains (a CNAME
from `notes.theircompany.com`); set `CUSTOM_DOMAIN_CNAME_TARGET` to it. Keep it
DNS only even if you proxy the others later: Cloudflare can't proxy other
people's domains through it, and Caddy has to answer them itself to issue
their certificates. See [Custom domains](#custom-domains) below.

Wait for DNS propagation (usually a few minutes).

If you use Cloudflare, start with "DNS only" (grey cloud). You can enable its proxy later after verifying everything works.

## 5. Create the database tables

The server only has Docker, so create the tables from a machine with Node.js
and a checkout of this repository, before the first start:

```bash
# In the repo root
npm install
DATABASE_URL="your-connection-string" npm run db:push
```

If the database only accepts connections from the server, open an SSH tunnel
first (see step 4 of [`SELF_HOSTING.md`](../SELF_HOSTING.md)). `db:push` asks
for confirmation before it changes anything.

## 6. Deploy

```bash
cd ~/opendocs/deploy

# Build and start everything
docker compose up -d --build

# Check that the containers are running
docker compose ps

# Check logs
docker compose logs caddy
docker compose logs web
docker compose logs api
docker compose logs mcp
docker compose logs converter
docker compose logs docs   # only with COMPOSE_PROFILES=docs
```

Caddy will automatically obtain TLS certificates from Let's Encrypt on first request. This takes a few seconds.

## 7. Verify

```bash
# API health check
curl https://api.example.com/healthz

# Web app
curl -I https://example.com

# MCP server
curl https://mcp.example.com/healthz

# Docs (with OPENDOCS_DOCS_SITE=on)
curl -I https://docs.example.com
```

## Architecture

One server runs these Docker Compose services:

```text
Internet → Caddy → web (Next.js)         example.com and custom domains
                → api (Express)          api.example.com
                     → converter (FastAPI + LibreOffice)   :8080, Docker network only
                     → PostgreSQL (external)
                → mcp (Express) → api    mcp.example.com, no secrets
                → docs (Nginx)           docs.example.com (docs profile)
           Caddy → api:4001 (tls-ask)    Docker network only
```

The converter source lives in the sibling `doc-converter` checkout. The main
API uses `DOC_CONVERTER_URL=http://converter:8080`; Docker resolves the service
name. Do not use `localhost`: inside the API container that means the API
container itself. The converter has no published host port or public Caddy route.
It retains outbound connectivity to download document images and branding logos.

## Conversion service (same server)

The defaults suit a small 2 vCPU / 4 GB server:

- One simultaneous conversion (`CONVERT_MAX_WORKERS=1`).
- A one-CPU quota and 1500M memory cap, with container swap disabled.
- Rotated container logs (three files of up to 10 MB each).
- The health check in the converter Dockerfile probes `/healthz`.

These limits bound converter usage; confirm actual host memory headroom and test
large documents before increasing them (`docker-compose.yml` has sizing notes).
The API allows 30 seconds per export, including time waiting for the converter.
The PDF subprocess has its own 60-second timeout. Bursts can therefore time out
with a single conversion slot. Docker build processes are not covered by the
runtime container limits; avoid rebuilding the web app while testing or
handling large exports.

### Deploy or update only the converter

```bash
# Source checkout should be a sibling of ~/opendocs
cd ~/doc-converter
git pull
cd ~/opendocs/deploy
docker compose build converter
docker compose up -d --no-deps --wait --wait-timeout 120 converter

# Health check from the API container, exercising Docker networking
docker compose exec -T api node -e 'fetch(process.env.DOC_CONVERTER_URL + "/healthz").then(async r => { console.log(await r.text()); if (!r.ok) process.exit(1); }).catch(e => { console.error(e); process.exit(1); })'
```

Expected health response includes `"status":"ok"` and `"max_workers":1`.
Use `DOC_CONVERTER_BUILD_CONTEXT` in `deploy/.env` if the source checkout lives
elsewhere; relative paths are resolved from `deploy/`.

## Common operations

### View logs

```bash
docker compose logs -f          # all services
docker compose logs -f web      # just the web app
docker compose logs -f api      # just the API
docker compose logs -f mcp      # just the MCP server
docker compose logs -f caddy    # just Caddy
```

### Redeploy after code changes

```bash
cd ~/opendocs
git pull
cd deploy
docker compose up -d --build
```

New files in `drizzle/` are changes to existing databases. They're
idempotent; apply each one once, in order, before deploying the code that
needs it:

```bash
psql "your-connection-string" -f drizzle/00NN_name.sql
```

### Restart a single service

```bash
docker compose restart web
```

### Update Caddy config

The `Caddyfile` is a single-file bind mount. After editing it in place on the
server, reload without downtime:

```bash
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

After a `git pull` that changes it, restart Caddy instead: the pull replaces
the file, and the running container keeps seeing the old one until it
restarts. Certificates are in the `caddy_data` volume, so a restart doesn't
request new ones; sites are down for a few seconds.

```bash
docker compose restart caddy
```

### Custom domains

Pro and Team workspaces can serve their documents on their own domain, such as
`notes.theircompany.com` (see the docs page `publishing/custom-domains`). How it
works on this server:

- Customers CNAME their subdomain to `CUSTOM_DOMAIN_CNAME_TARGET` (the
  `custom` A record in [section 4](#4-point-dns-to-your-server)) and add a TXT
  record that proves they own it. Root domains are only offered when
  `CUSTOM_DOMAIN_IPV4` is set; leave it empty for subdomains only. The API
  checks the records against 1.1.1.1 and 8.8.8.8, on save, on "Check now"
  and every 6 hours.
- The catch-all `https://` site in the `Caddyfile` sends every hostname that
  isn't one of ours to `web:3000`, with **on-demand TLS**: the first visit to a
  new domain makes Caddy get a Let's Encrypt certificate. Before it does, it
  asks `http://api:4001/internal/tls-ask?domain=<host>`, and the API answers
  200 only for verified domains on Pro and Team workspaces. Port 4001 is the
  API's internal server: it isn't published in `docker-compose.yml` and Caddy
  never proxies it, so only containers on the Compose network reach it.
- Certificates are kept in the `caddy_data` volume and renew on their own.
- Settings in `deploy/.env`: `CUSTOM_DOMAIN_CNAME_TARGET`,
  `CUSTOM_DOMAIN_IPV4` (leave empty: subdomains only) and `INTERNAL_PORT`
  (default `4001`, also set in `docker-compose.yml`).

To check what the ask endpoint says about a domain, from inside the network:

```bash
docker compose exec caddy wget -qO- "http://api:4001/internal/tls-ask?domain=notes.theircompany.com"
# "ok" for an active domain on Pro or Team; a 404 error for anything else
```

From the server itself, `curl http://localhost:4001/...` should fail: the port
isn't published.

### MCP server

The `mcp` service lets Claude, ChatGPT, Cursor and other AI apps use
OpenDocs at `https://mcp.example.com/mcp`. The web app is its OAuth
authorization server (Better Auth's `jwt`, `@better-auth/mcp` and
`@better-auth/cimd` plugins); the MCP service verifies access tokens against
`https://example.com/api/auth/jwks` and calls the API with them. It gets no
`env_file`, so no database or storage secrets. It needs the `mcp` A record
above.

Check it:

```bash
curl -s https://mcp.example.com/healthz
curl -s https://mcp.example.com/.well-known/oauth-protected-resource/mcp
curl -s https://example.com/.well-known/oauth-authorization-server/api/auth | head -c 300
curl -si -X POST https://mcp.example.com/mcp | grep -i www-authenticate   # 401 with resource_metadata
```

The first request to `/api/auth/jwks` creates the signing key (stored in the
`jwks` table). Don't delete it: every issued token would stop working and
everyone would have to reconnect.

### Backups

A hosted database provider usually backs it up for you. If PostgreSQL runs on
the server, in a Compose service named `db`:

```bash
# Add to crontab: daily backup at 3 AM
0 3 * * * docker compose exec -T db pg_dump -U opendocs opendocs | gzip > /backups/opendocs-$(date +\%Y\%m\%d).sql.gz
```

## Monitoring (optional)

Install Uptime Kuma for simple uptime monitoring:

```bash
docker run -d \
  --name uptime-kuma \
  --restart unless-stopped \
  -p 127.0.0.1:3001:3001 \
  -v uptime-kuma:/app/data \
  louislam/uptime-kuma
```

Then add a Caddy route to access it (or keep it internal and SSH tunnel).
