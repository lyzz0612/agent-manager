#!/usr/bin/env bash
# all-in-one entrypoint: start Fastify server, wait for /healthz, then launch
# the bundled agentops-runner daemon. Both processes share the container; any
# exit terminates the container.
set -euo pipefail

: "${AGENTOPS_TOKEN:?AGENTOPS_TOKEN is required for the all-in-one image}"
PORT="${AGENTOPS_PORT:-4000}"
SERVER_URL="${AGENTOPS_RUNNER_SERVER_URL:-http://127.0.0.1:${PORT}}"
RUNNER_NAME="${AGENTOPS_RUNNER_NAME:-allinone-$(hostname)}"

log() { printf '[allinone] %s\n' "$*"; }

start_server() {
  log "starting server on :${PORT}"
  node server/dist/index.js &
  SERVER_PID=$!
}

wait_for_healthz() {
  log "waiting for http://127.0.0.1:${PORT}/healthz"
  for i in $(seq 1 60); do
    if node -e "fetch('http://127.0.0.1:${PORT}/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
      log "server healthy (attempt $i)"
      return 0
    fi
    sleep 1
  done
  log "server failed to become healthy"
  return 1
}

bootstrap_runner() {
  if [[ -f "${AGENTOPS_HOME:-/data/runner}/credentials.json" ]]; then
    log "runner credentials already present; skipping login"
    return 0
  fi
  log "logging runner in against bundled server"
  node cli/bin/agentops-runner.mjs login \
    --server "$SERVER_URL" \
    --token "$AGENTOPS_TOKEN" \
    --name "$RUNNER_NAME"
}

start_runner() {
  log "starting runner daemon"
  node cli/bin/agentops-runner.mjs daemon &
  RUNNER_PID=$!
}

cleanup() {
  log "received shutdown signal"
  [[ -n "${RUNNER_PID:-}" ]] && kill "$RUNNER_PID" 2>/dev/null || true
  [[ -n "${SERVER_PID:-}" ]] && kill "$SERVER_PID" 2>/dev/null || true
  wait || true
}
trap cleanup INT TERM

start_server
wait_for_healthz
if [[ "${AGENTOPS_ALLINONE_SKIP_RUNNER:-0}" != "1" ]]; then
  bootstrap_runner || log "runner bootstrap failed (server may be reachable but login rejected); continuing without runner"
  start_runner
else
  log "AGENTOPS_ALLINONE_SKIP_RUNNER=1; not starting bundled runner"
fi

wait -n
exit $?
