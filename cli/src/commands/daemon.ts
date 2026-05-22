// `daemon` command: open a long-lived WebSocket to the Server, run an initial
// detect sweep, then execute incoming actions and stream results back. The
// daemon process keeps running until Ctrl+C or until the Server reports stale
// credentials, in which case it exits with code 3.

import { hostname as osHostname } from 'node:os';
import {
  ensurePaths,
  resolvePaths,
  type PathsContext,
} from '../state/paths.ts';
import { loadCredentials } from '../state/credentials.ts';
import { buildWebSocketUrl } from '../protocol/client.ts';
import { DaemonConnection } from '../daemon/connection.ts';
import { createDefaultRegistry } from '../adapters/registry.ts';
import { ActionExecutor } from '../executor/executor.ts';
import { RUNNER_VERSION } from '../version.ts';
import { logger } from '../utils/logger.ts';
import type {
  AgentDetectReport,
  RunnerActionResult,
  RunnerAgentReport,
} from '../protocol/types.ts';

export interface DaemonCommandOptions {
  paths?: PathsContext;
  /** Custom connection factory for tests. */
  connectionFactory?: (options: {
    url: string;
    machineId: string;
    hostname: string;
    runnerVersion: string;
  }) => DaemonConnection;
  /** Override the default registry (e.g. tests). */
  registryFactory?: typeof createDefaultRegistry;
  /** Resolves once the daemon has stopped (auth failure or stop signal). */
  exitOnAuthFailure?: boolean;
}

export interface DaemonHandle {
  stop: () => Promise<void>;
  /** Promise that resolves when the daemon is no longer running. */
  done: Promise<void>;
}

export function runDaemon(options: DaemonCommandOptions = {}): DaemonHandle {
  const paths = options.paths ?? resolvePaths();
  ensurePaths(paths);
  const credentials = loadCredentials(paths.credentialsFile);
  if (!credentials) {
    throw new Error(
      `No credentials found at ${paths.credentialsFile}. Run 'agentops-runner login' first.`,
    );
  }
  const url = buildWebSocketUrl(credentials.serverUrl, credentials.runnerToken);
  const registry = (options.registryFactory ?? createDefaultRegistry)();
  const executor = new ActionExecutor({
    registry,
    machineId: credentials.machineId,
    logsDir: paths.logsDir,
  });

  const factory =
    options.connectionFactory ??
    ((opts) =>
      new DaemonConnection({
        ...opts,
        platform: process.platform,
        arch: process.arch,
      }));
  const connection = factory({
    url,
    machineId: credentials.machineId,
    hostname: getHostname(paths),
    runnerVersion: RUNNER_VERSION,
  });

  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  let stopped = false;
  const stop = async () => {
    if (stopped) return done;
    stopped = true;
    connection.stop();
    resolveDone();
    return done;
  };

  connection.on('open', async () => {
    logger.info(`Daemon connected to ${url}`);
    try {
      const reports = await executor.detectAll();
      connection.send(toDetectReportMessage(reports) as never);
      logger.info(`Auto-detect complete: ${reports.length} agents reported.`);
    } catch (err) {
      logger.error('Auto-detect failed', err);
    }
  });

  connection.on('action', async (action) => {
    logger.info(
      `Received ${action.actionType} for ${action.agentType} (action ${action.actionId}).`,
    );
    try {
      const { result, followUpReport } = await executor.execute(action);
      connection.send(toActionResultMessage(result) as never);
      if (followUpReport) {
        connection.send(toDetectReportMessage([followUpReport], result.actionId) as never);
      }
    } catch (err) {
      logger.error(`Action ${action.actionId} crashed`, err);
    }
  });

  connection.on('authFailure', async (failure) => {
    logger.error(
      `Authentication rejected by server (${failure.reason}): ${failure.message}`,
    );
    if (options.exitOnAuthFailure !== false) {
      await stop();
      // Mark stale credentials so the supervisor can react. Exit code 3 is
      // documented in README so deployment scripts can distinguish from
      // transient failures.
      if (!options.connectionFactory) process.exitCode = 3;
    }
  });

  connection.on('close', ({ code, reason }) => {
    logger.info(`Daemon socket closed (${code} ${reason || ''}).`);
  });

  connection.on('error', (err) => {
    logger.warn('Daemon socket error', err.message);
  });

  connection.start();
  return { stop, done };
}

function toDetectReportMessage(reports: RunnerAgentReport[], actionId?: string) {
  return {
    v: 1,
    type: 'runner.report.detect',
    reports: reports.map((item) => toServerDetectReport(item.report)),
    ...(actionId ? { actionId } : {}),
  };
}

function toServerDetectReport(report: AgentDetectReport) {
  return {
    agentKind: report.agentType,
    status: report.status,
    version: report.version ?? null,
    execPath: report.executablePath ?? null,
    onPath: report.onPath,
    configSummary:
      report.configFiles
        .filter((file) => file.exists)
        .map((file) => file.summary ?? file.path)
        .join('; ') || null,
  };
}

function toActionResultMessage(result: RunnerActionResult) {
  return {
    v: 1,
    type: 'runner.report.action_result',
    actionId: result.actionId,
    status: result.state,
    summary: result.summary,
    logs: result.logExcerpt.map((message) => ({ level: 'info', message })),
  };
}

function getHostname(_paths: PathsContext): string {
  try {
    return osHostname() || 'unknown-host';
  } catch {
    return 'unknown-host';
  }
}
