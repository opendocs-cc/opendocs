FROM node:22.23.4-alpine AS base

WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/docs/package.json apps/docs/
RUN npm ci --workspace=@opendocs/docs --include-workspace-root

# Build (extends deps so node_modules are available)
FROM deps AS builder
COPY apps/docs ./apps/docs
RUN npm run build --workspace=@opendocs/docs

FROM nginx:1.27-alpine AS runner
COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/docs/build /usr/share/nginx/html
EXPOSE 3000
