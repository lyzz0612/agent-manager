// Public entrypoint for embedders / tests. The CLI launcher uses `cli.ts`
// directly; programmatic consumers prefer this barrel.

export * from './protocol/types.ts';
export * from './adapters/types.ts';
export { AdapterRegistry, createDefaultRegistry } from './adapters/registry.ts';
export { CursorAdapter } from './adapters/cursor.ts';
export { CodexAdapter } from './adapters/codex.ts';
export { ClaudeCodeAdapter } from './adapters/claude-code.ts';
export { ActionExecutor } from './executor/executor.ts';
export { PerAgentSerialQueue } from './executor/queue.ts';
export { DaemonConnection } from './daemon/connection.ts';
export {
  resolvePaths,
  ensurePaths,
  type PathsContext,
} from './state/paths.ts';
export {
  loadCredentials,
  saveCredentials,
  clearCredentials,
  type RunnerCredentials,
} from './state/credentials.ts';
export {
  loadOrCreateMachineId,
  getMachineIdentity,
  type MachineIdentity,
} from './state/machine-id.ts';
export { runLogin } from './commands/login.ts';
export { runDaemon } from './commands/daemon.ts';
export { buildStatus, formatStatus } from './commands/status.ts';
export { main, parseArgs } from './cli.ts';
export { RUNNER_VERSION } from './version.ts';
