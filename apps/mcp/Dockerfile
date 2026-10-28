FROM node:22.23.4-alpine AS base

WORKDIR /app

# Install dependencies (only the MCP service: it talks to the API over HTTP
# and needs none of the shared database code).
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/mcp/package.json apps/mcp/
RUN npm ci --workspace=@opendocs/mcp --include-workspace-root

FROM deps AS runner
COPY apps/mcp/ apps/mcp/

ENV NODE_ENV=production
ENV PORT=4100

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser

USER appuser
EXPOSE 4100

CMD ["node", "--import", "tsx", "apps/mcp/src/index.ts"]
