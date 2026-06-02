FROM node:22-bookworm-slim AS web-builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/web apps/web
RUN npm run build:web

FROM rust:1.79-bookworm AS server-builder
WORKDIR /app

COPY Cargo.toml VERSION ./
COPY apps/server apps/server
COPY crates crates
RUN cargo build --release -p agent-manager-server

FROM debian:bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl bash git \
  && rm -rf /var/lib/apt/lists/*

ENV APP_ENV=production
ENV PORT=3000
ENV MANAGED_BASE_DIR=/app/state
ENV WEB_DIST_DIR=/app/apps/web/dist

COPY VERSION /app/VERSION
COPY --from=web-builder /app/apps/web/dist /app/apps/web/dist
COPY --from=server-builder /app/target/release/agent-manager-server /usr/local/bin/agent-manager-server

EXPOSE 3000

CMD ["agent-manager-server"]
