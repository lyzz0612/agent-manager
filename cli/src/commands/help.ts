import { RUNNER_VERSION } from '../version.ts';

export const HELP_TEXT = `agentops-runner ${RUNNER_VERSION}
AgentOps Runner CLI - detect, install, upgrade, doctor and uninstall managed AI coding agents.

Usage:
  agentops-runner <command> [options]

Commands:
  login     Bind this machine to an AgentOps Server by submitting a Server URL and token.
  daemon    Connect to the Server, perform an initial detect sweep and execute incoming actions.
  status    Print the resolved local state directory and stored credentials summary (no secrets).
  help      Show this help (alias: --help, -h).
  version   Print the runner version (alias: --version, -v).

Examples:
  agentops-runner login --server https://agentops.example.com --token <admin-token>
  agentops-runner daemon

Environment variables:
  AGENTOPS_HOME       Override the local state directory.
  AGENTOPS_DEV=1      Force the development default <repo>/.agentops-dev when run from a checkout.
  AGENTOPS_LOG_LEVEL  debug | info | warn | error (default: info)

Docs:
  Cursor:       https://docs.cursor.com/get-started/installation
  OpenAI Codex: https://github.com/openai/codex#installation
  Claude Code:  https://docs.claude.com/en/docs/claude-code/setup
`;
