# The ads add-on (packages/ads): a placeholder that does nothing, unless a
# build points ADS_DIR at a replacement inside the build context.
ARG ADS_DIR=packages/ads

FROM node:22.23.4-alpine AS base

WORKDIR /app

# Install dependencies
FROM base AS deps
ARG ADS_DIR
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY ${ADS_DIR}/package.json packages/ads/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@opendocs/shared --workspace=@opendocs/ads --workspace=@opendocs/web --include-workspace-root

# Build (extends deps so workspace symlinks in node_modules are preserved)
FROM deps AS builder
ARG ADS_DIR
COPY packages/shared/ packages/shared/
COPY ${ADS_DIR}/ packages/ads/
COPY apps/web/ apps/web/

ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* vars are inlined by Next.js at build time — they must be
# available here or they'll be undefined in the production bundle.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WEB_URL
ARG NEXT_PUBLIC_MCP_URL
ARG NEXT_PUBLIC_SELF_HOSTED
ARG NEXT_PUBLIC_PLAUSIBLE_DOMAIN
ARG NEXT_PUBLIC_AD_PIXELS_ENABLED
ARG NEXT_PUBLIC_PADDLE_SANDBOX_CLIENT_TOKEN
ARG NEXT_PUBLIC_PADDLE_LIVE_CLIENT_TOKEN
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL
ENV NEXT_PUBLIC_MCP_URL=$NEXT_PUBLIC_MCP_URL
ENV NEXT_PUBLIC_SELF_HOSTED=$NEXT_PUBLIC_SELF_HOSTED
ENV NEXT_PUBLIC_PLAUSIBLE_DOMAIN=$NEXT_PUBLIC_PLAUSIBLE_DOMAIN
ENV NEXT_PUBLIC_AD_PIXELS_ENABLED=$NEXT_PUBLIC_AD_PIXELS_ENABLED
ENV NEXT_PUBLIC_PADDLE_SANDBOX_CLIENT_TOKEN=$NEXT_PUBLIC_PADDLE_SANDBOX_CLIENT_TOKEN
ENV NEXT_PUBLIC_PADDLE_LIVE_CLIENT_TOKEN=$NEXT_PUBLIC_PADDLE_LIVE_CLIENT_TOKEN

# Dummy DATABASE_URL so Next.js can evaluate server modules during
# "Collecting page data" without throwing.  The value is fake — it
# never reaches a real database and is discarded after this stage.
# The real URL is injected at runtime via docker-compose env_file.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/placeholder"

# The ads add-on can bring its own build-time settings in build.env.
RUN if [ -f packages/ads/build.env ]; then set -a; . ./packages/ads/build.env; set +a; fi; \
    npm run build --workspace=apps/web

# Run
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
