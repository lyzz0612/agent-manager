# Runtime image for agentops-runner.
#
# This image is what the recommended dev combo (`pnpm dev:docker:runner`) uses
# to isolate Agent install/detect/upgrade/uninstall operations from the host.
# Production deployments may also use this image directly instead of installing
# the runner from npm globally.
# syntax=docker/dockerfile:1.6

ARG NODE_VERSION=22-alpine
ARG VERSION=dev

# ---------- build ----------
FROM node:${NODE_VERSION} AS build
WORKDIR /app

RUN apk add --no-cache python3 make g++ libc6-compat \
 && corepack enable \
 && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY cli/package.json cli/
COPY packages/protocol/package.json packages/protocol/
COPY pnpm-lock.yaml* ./

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile=false \
      --filter @lyzz0612/agentops-runner \
      --filter @lyzz0612/agentops-protocol

COPY cli ./cli
COPY packages ./packages

# The runner CLI relies on Node 22 type stripping in production today (the
# `tsc` build is pinned to a future fix in cli/src/* import paths). Attempt
# the build; on failure, ship TS source which the bin shim picks up via
# --experimental-strip-types.
RUN pnpm --filter @lyzz0612/agentops-runner build || \
      echo "[cli/Dockerfile] tsc build skipped; runtime will use TS source via --experimental-strip-types" \
 && mkdir -p cli/dist

# ---------- runtime ----------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ARG VERSION
ENV NODE_ENV=production \
    AGENTOPS_HOME=/var/agentops \
    AGENTOPS_DEV=0 \
    NODE_OPTIONS="--experimental-strip-types --no-warnings=ExperimentalWarning"

RUN apk add --no-cache tini bash curl ca-certificates git \
 && mkdir -p /var/agentops \
 && addgroup -S agentops && adduser -S agentops -G agentops -h /home/agentops

COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/cli/package.json cli/
COPY --from=build /app/cli/bin cli/bin
# Always ship TS source so the bin shim's fallback works; the (possibly
# empty) dist is also shipped so prod uses precompiled JS when available.
COPY --from=build /app/cli/src cli/src
COPY --from=build /app/cli/tsconfig.json cli/tsconfig.json
COPY --from=build /app/cli/dist cli/dist
COPY --from=build /app/packages packages
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/cli/node_modules cli/node_modules

RUN echo "$VERSION" > /etc/agentops-runner-version \
 && chown -R agentops:agentops /var/agentops /app /home/agentops

USER agentops
VOLUME ["/var/agentops"]

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "cli/bin/agentops-runner.mjs", "daemon"]
