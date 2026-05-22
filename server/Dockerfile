# Pure Server image: Fastify API + SQLite, no web bundle, no runner CLI.
# Build context is the repository root so the workspace can be resolved.
# syntax=docker/dockerfile:1.6

ARG NODE_VERSION=22-alpine
ARG VERSION=dev

# ---------- build ----------
FROM node:${NODE_VERSION} AS build
WORKDIR /app

# Tools that better-sqlite3 needs to compile when no prebuilt is available.
RUN apk add --no-cache python3 make g++ libc6-compat \
 && corepack enable \
 && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY server/package.json server/
COPY packages/protocol/package.json packages/protocol/
# Lockfile is optional in dev to keep the build resilient when only a partial
# workspace is checked out (e.g. the release pipeline builds this image after
# pnpm-lock.yaml has been committed by the dev-testing change).
COPY pnpm-lock.yaml* ./

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile=false \
      --filter @agentops/server \
      --filter @lyzz0612/agentops-protocol

COPY server ./server
COPY packages ./packages

RUN pnpm --filter @agentops/server build

# ---------- runtime ----------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ARG VERSION
ENV NODE_ENV=production \
    AGENTOPS_HOST=0.0.0.0 \
    AGENTOPS_PORT=4000 \
    AGENTOPS_DB_PATH=/data/agentops.db \
    AGENTOPS_LOG_LEVEL=info

RUN apk add --no-cache tini libstdc++ \
 && corepack enable \
 && corepack prepare pnpm@9.15.0 --activate \
 && mkdir -p /data \
 && addgroup -S agentops && adduser -S agentops -G agentops

COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/tsconfig.base.json ./
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/packages packages
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/server/node_modules server/node_modules

RUN echo "$VERSION" > /etc/agentops-version \
 && chown -R agentops:agentops /data /app

USER agentops
EXPOSE 4000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.AGENTOPS_PORT||4000) +'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/dist/index.js"]
