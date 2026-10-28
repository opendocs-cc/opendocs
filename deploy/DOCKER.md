# Docker Container Management

Quick reference for managing the OpenDocs Docker stack on your server. All commands run from `deploy/` in your checkout (`~/opendocs/deploy`).

The stack has six services on one server: `web`, `api`, `mcp`, `converter`, `caddy`, and `docs` (only with `COMPOSE_PROFILES=docs`).

---

## Web (`web`) — Next.js app on port 3000

```bash
# Redeploy (rebuild image from latest code)
docker compose up -d --build web

# Restart (no rebuild, just restart the container)
docker compose restart web

# View logs (follow)
docker compose logs -f web

# View last 100 lines
docker compose logs --tail 100 web

# Stop
docker compose stop web

# Check status
docker compose ps web
```

## API (`api`) — Express server on port 4000

```bash
# Redeploy
docker compose up -d --build api

# Restart
docker compose restart api

# View logs
docker compose logs -f api

# View last 100 lines
docker compose logs --tail 100 api

# Stop
docker compose stop api

# Check status
docker compose ps api
```

## MCP server (`mcp`) — Express server on port 4100

Holds no secrets: it verifies OAuth access tokens from the web app and calls
the API with them.

```bash
# Redeploy
docker compose up -d --build mcp

# View logs
docker compose logs -f mcp

# Health check (through Caddy: it only answers to its own hostname)
curl -s https://mcp.example.com/healthz
```

## Docs (`docs`) — Documentation site on port 3000

Before replacing the running docs container, keep its hashed assets so pages
that browsers already loaded can still fetch their CSS and JS (nginx falls back
to `deploy/docs-legacy-assets/`, which isn't in git):

```bash
docker compose cp docs:/usr/share/nginx/html/assets/. docs-legacy-assets/
```

```bash
# Redeploy
docker compose up -d --build docs

# Restart
docker compose restart docs

# View logs
docker compose logs -f docs

# View last 100 lines
docker compose logs --tail 100 docs

# Stop
docker compose stop docs

# Check status
docker compose ps docs
```

## Caddy (reverse proxy)

```bash
# View logs
docker compose logs -f caddy

# Reload config without restart (after editing the Caddyfile in place;
# after a git pull changes it, restart instead, see SETUP.md)
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile

# Restart
docker compose restart caddy
```

## Document converter (`converter`)

The converter runs in the same Compose stack, with one worker, a one-CPU quota,
and a 1500M memory cap. No host port is published. The API uses
`DOC_CONVERTER_URL=http://converter:8080` over Docker networking.

```bash
# View logs / resource use
docker compose logs --tail 100 converter
docker compose stats converter

# Update source in the sibling checkout, then redeploy only this service
git -C ../../doc-converter pull
docker compose build converter
docker compose up -d --no-deps --wait --wait-timeout 120 converter

# Health check through the API container
docker compose exec -T api node -e 'fetch(process.env.DOC_CONVERTER_URL + "/healthz").then(async r => { console.log(await r.text()); if (!r.ok) process.exit(1); }).catch(e => { console.error(e); process.exit(1); })'
```

Changing `DOC_CONVERTER_URL` requires recreating the API container:
`docker compose up -d --no-deps --no-build api`. A plain restart does not apply
environment changes. See `SETUP.md` for the converter's limits and sizing.

---

## Common tasks

### Node.js security updates

The API, web and MCP runtime images, and the docs build stage, pin Node.js
`22.23.4-alpine` (the October 21, 2026 security release). Update all four
`apps/*/Dockerfile` base images together when applying the next Node 22 patch.
The docs runtime is Nginx; the converter runs Python and LibreOffice.

Changing Node on the host or restarting existing containers does not update
their bundled Node runtime. Pull the patched base, rebuild, then recreate:

```bash
# Preserve the running images under unique rollback tags before rebuilding.
# Build sequentially to limit memory pressure on the 4 GB host.
docker compose build --pull api
docker compose build --pull web
docker compose build --pull mcp
docker compose up -d --no-deps --no-build api web mcp

# Verify the actual running versions and application health.
docker compose exec -T api node --version
docker compose exec -T web node --version
curl --fail https://api.example.com/healthz
curl --fail --head https://example.com
```

Also smoke-test authentication and document export. The docs build-stage pin
will take effect on its next rebuild; the live static site has no Node runtime.
Keep the previous images until verification succeeds. Avoid pruning images or
volumes as part of the update; old unused build cache can be cleared if needed.

**Redeploy everything** (after `git pull`):

```bash
docker compose up -d --build
```

**View all logs at once:**

```bash
docker compose logs -f
```

**Check all container statuses:**

```bash
docker compose ps
```

**Full teardown and rebuild** (nuclear option):

```bash
docker compose down
docker compose up -d --build
```
