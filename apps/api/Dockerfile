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
COPY apps/api/package.json apps/api/
RUN npm ci --workspace=@opendocs/shared --workspace=@opendocs/ads --workspace=@opendocs/api --include-workspace-root

# Run (extends deps so workspace symlinks in node_modules are preserved)
FROM deps AS runner
ARG ADS_DIR
COPY packages/shared/ packages/shared/
COPY ${ADS_DIR}/ packages/ads/
COPY apps/api/ apps/api/

ENV NODE_ENV=production
ENV PORT=4000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser

USER appuser
EXPOSE 4000

CMD ["node", "--import", "tsx", "apps/api/src/index.ts"]
