# `@lyzz0612/agentops-runner`

AgentOps Runner CLI. Runs on a managed machine to detect, install, upgrade,
doctor and uninstall Cursor, OpenAI Codex, and Claude Code agents. Communicates
with an AgentOps Server (Node/TypeScript control plane).

This package is part of the [`agent-manager`](../README.md) monorepo. The
public command is `agentops-runner`.

## Install

Requires Node.js >= 22 (uses the built-in `WebSocket`, `fetch`, and
type-stripped `.ts` execution).

```bash
npm install -g @lyzz0612/agentops-runner
```

For local development from this repository:

```bash
cd cli
npm install            # populates node_modules with TypeScript + @types/node
npm run build          # writes dist/
node ./bin/agentops-runner.mjs --help
```

`bin/agentops-runner.mjs` first tries the built `dist/` output, then falls back
to running the TypeScript sources directly with Node's type stripping so a
fresh checkout works without a prior build.

## Commands

```text
agentops-runner login    Bind this machine to an AgentOps Server.
agentops-runner daemon   Open a long-lived connection, auto-detect, execute actions.
agentops-runner status   Print local state directory and stored credential summary (no secrets).
agentops-runner help     Show the full help screen.
agentops-runner version  Print the runner version.
```

### `login`

```bash
agentops-runner login --server https://agentops.example.com --token <admin-token>
```

Sends `POST /api/v1/runner/login` with the machine identity (`machineId` is
generated and persisted under the runner state directory). Stores the Server
URL, the returned `runnerToken`, the `machineId`, and optional display name.

### `daemon`

```bash
agentops-runner daemon
```

Connects to `wss://<server>/api/v1/runner/ws?token=<runnerToken>` and:

1. Sends `runner.hello`.
2. Runs an initial detect for Cursor / Codex / Claude Code, sending one
   `runner.agent_report` per agent.
3. Heartbeats every 15 seconds.
4. Reconnects with exponential backoff on socket close.
5. Exits with code `3` when the server replies with
   `server.auth_failure` so deployment scripts can advise the operator to run
   `agentops-runner login` again.

V1 does **not** expose any cancel entrypoint. Actions are bounded by per-type
timeouts (see `src/executor/timeout.ts`).

## Local state directory

Resolved in this order:

1. `AGENTOPS_HOME` (highest priority).
2. `<repo>/.agentops-dev` when run from an `agent-manager` checkout, or
   `AGENTOPS_DEV=1` is set.
3. `<homedir>/.agentops` (production default).

Contents:

```text
<root>/
  credentials.json      # serverUrl, runnerToken, machineId, displayName, registeredAt
  machine-id            # plain text id, generated once
  logs/                 # per-action log files (ActionLog tails)
  cache/                # adapter scratch space
```

## Adapters

Agent capabilities live in `src/adapters/*.ts`. Each adapter records the
official documentation URL it follows for install / upgrade / uninstall to
satisfy the OpenSpec requirement that runner mutations never invent commands.

| Agent | Package | Install docs |
| ----- | ------- | ------------ |
| Cursor | `cursor` / `cursor-agent` CLI | <https://docs.cursor.com/get-started/installation> |
| OpenAI Codex | `@openai/codex` | <https://github.com/openai/codex#installation> |
| Claude Code | `@anthropic-ai/claude-code` | <https://docs.claude.com/en/docs/claude-code/setup> |

Adapters are registered through `AdapterRegistry` (`src/adapters/registry.ts`);
new agents are added by registering an adapter rather than by adding branches in
the executor.

## Action execution

- Per-agent serial queue (`PerAgentSerialQueue`).
- Different agents run in parallel.
- Per-action timeouts (`detect` 30s, `doctor` 60s, `uninstall` 5m, `install` /
  `upgrade` 10m). The server may request a smaller timeout; the executor uses
  whichever is smaller.
- Each action collects up to 200 log lines into an `ActionLog`; the tail
  (last 20 lines) is reported as `logExcerpt` in `runner.action_result`.

## Container development

This package does **not** ship a Dockerfile (the wider repo handles that). For
container-isolated local development, mount `cli/` and a writable volume for
the state directory:

```bash
docker run --rm -it \
  -v "$PWD/cli:/app" \
  -v "agentops-state:/state" \
  -e AGENTOPS_HOME=/state \
  -w /app \
  node:22-bookworm bash
# inside the container:
node ./bin/agentops-runner.mjs status
```

The container should not pre-install Cursor / Codex / Claude Code; the runner
itself drives those installs through the documented commands.

## Tests

```bash
npm test                 # unit tests (no real agents needed)
AGENTOPS_E2E_AGENTS=all npm run test:integration   # opt-in per-agent integration tests
```

Per-agent integration tests under `test/integration/` skip automatically unless
the agent is listed in `AGENTOPS_E2E_AGENTS` (comma-separated, or `all`). They
only invoke `detect`; they never mutate the host.

## Protocol

Runner ↔ Server messages live in `src/protocol/types.ts`. V1 keeps them in this
package; a follow-up change should extract them into a shared
`@lyzz0612/agentops-protocol` package so the Server can import the same DTOs
without depending on the runner. Tracked in the parent commit summary as a
"main session" follow-up.
