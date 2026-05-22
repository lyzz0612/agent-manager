// Action executor. Translates a `ServerActionRequest` into an adapter call,
// enforces timeouts, captures logs and returns a structured result. The
// executor never exposes a cancellation entrypoint to v1 callers; the only
// cancellation path is the timeout signal generated internally.

import { randomUUID } from 'node:crypto';
import type {
  AgentDetectReport,
  AgentType,
  DoctorResult,
  ManagementActionType,
  RunnerActionResult,
  RunnerAgentReport,
  ServerActionRequest,
} from '../protocol/types.ts';
import type { AdapterRegistry } from '../adapters/registry.ts';
import type {
  AdapterContext,
  AgentAdapter,
  MutationResult,
} from '../adapters/types.ts';
import { PerAgentSerialQueue } from './queue.ts';
import { resolveTimeout } from './timeout.ts';
import {
  ActionLog,
  actionLogFilePath,
} from './action-log.ts';

export interface ExecutorOptions {
  registry: AdapterRegistry;
  machineId: string;
  logsDir?: string;
  /** Override for unit tests that don't want a real serial queue. */
  queue?: PerAgentSerialQueue;
}

export interface ActionExecution {
  result: RunnerActionResult;
  /** Set when the action also produced an updated agent report (detect / install / upgrade / uninstall). */
  followUpReport?: RunnerAgentReport;
}

export class ActionExecutor {
  private readonly registry: AdapterRegistry;
  private readonly machineId: string;
  private readonly logsDir: string | undefined;
  private readonly queue: PerAgentSerialQueue;

  constructor(options: ExecutorOptions) {
    this.registry = options.registry;
    this.machineId = options.machineId;
    this.logsDir = options.logsDir;
    this.queue = options.queue ?? new PerAgentSerialQueue();
  }

  /** Run a server-issued action. Resolves once the action finishes. */
  execute(request: ServerActionRequest): Promise<ActionExecution> {
    const adapter = this.registry.require(request.agentType);
    return this.queue.enqueue(request.agentType, () =>
      this.runOne(adapter, request),
    );
  }

  /** Convenience for the daemon's connect-time detect sweep. */
  detectAll(signal?: AbortSignal): Promise<RunnerAgentReport[]> {
    const adapters = this.registry.list();
    return Promise.all(
      adapters.map((adapter) =>
        this.queue.enqueue(adapter.agentType, async () => {
          const ctx = this.buildContext(adapter.agentType, signal);
          const report = await adapter.detect(ctx);
          return this.toAgentReport(report, 'auto_detect');
        }),
      ),
    );
  }

  stats() {
    return this.queue.stats();
  }

  private async runOne(
    adapter: AgentAdapter,
    request: ServerActionRequest,
  ): Promise<ActionExecution> {
    const startedAt = new Date();
    const timeoutMs = resolveTimeout(request.actionType, request.timeoutMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const log = new ActionLog(
      this.logsDir
        ? { filePath: actionLogFilePath(this.logsDir, request.actionId) }
        : {},
    );
    const ctx: AdapterContext = {
      signal: controller.signal,
      log: (line) => log.add(line),
      platform: process.platform,
      arch: process.arch,
    };
    log.add(`action ${request.actionType} for ${request.agentType} started`);

    let state: RunnerActionResult['state'] = 'failed';
    let summary = '';
    let followUpReport: RunnerAgentReport | undefined;
    try {
      switch (request.actionType) {
        case 'detect': {
          const report = await adapter.detect(ctx);
          summary = describeDetect(report);
          followUpReport = this.toAgentReport(report, 'action');
          state = 'succeeded';
          break;
        }
        case 'install': {
          const mut = await adapter.install(ctx);
          summary = mut.summary;
          state = mut.ok ? 'succeeded' : 'failed';
          followUpReport = await this.followUpDetect(adapter, ctx, mut);
          break;
        }
        case 'upgrade': {
          const mut = await adapter.upgrade(ctx);
          summary = mut.summary;
          state = mut.ok ? 'succeeded' : 'failed';
          followUpReport = await this.followUpDetect(adapter, ctx, mut);
          break;
        }
        case 'uninstall': {
          const mut = await adapter.uninstall(ctx);
          summary = mut.summary;
          state = mut.ok ? 'succeeded' : 'failed';
          followUpReport = await this.followUpDetect(adapter, ctx, mut);
          break;
        }
        case 'doctor': {
          const result = await adapter.doctor(ctx);
          summary = describeDoctor(result);
          state = result.overall === 'fail' ? 'failed' : 'succeeded';
          break;
        }
      }
    } catch (err) {
      const aborted = controller.signal.aborted;
      summary = aborted
        ? `action timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err);
      log.add(`error: ${summary}`);
      state = 'failed';
    } finally {
      clearTimeout(timer);
    }
    const finishedAt = new Date();
    const result: RunnerActionResult = {
      type: 'runner.action_result',
      id: randomUUID(),
      machineId: this.machineId,
      actionId: request.actionId,
      agentType: request.agentType,
      actionType: request.actionType,
      state: state === 'succeeded' ? 'succeeded' : 'failed',
      summary: shortSummary(summary),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      logExcerpt: log.excerpt(),
    };
    return followUpReport ? { result, followUpReport } : { result };
  }

  private async followUpDetect(
    adapter: AgentAdapter,
    ctx: AdapterContext,
    mutation: MutationResult,
  ): Promise<RunnerAgentReport | undefined> {
    if (mutation.unsupported) return undefined;
    try {
      const report = await adapter.detect(ctx);
      return this.toAgentReport(report, 'action');
    } catch {
      return undefined;
    }
  }

  private toAgentReport(
    report: AgentDetectReport,
    source: 'auto_detect' | 'action',
  ): RunnerAgentReport {
    return {
      type: 'runner.agent_report',
      id: randomUUID(),
      machineId: this.machineId,
      agentType: report.agentType,
      report,
      source,
    };
  }

  private buildContext(
    _agentType: AgentType,
    signal?: AbortSignal,
  ): AdapterContext {
    const controller = new AbortController();
    if (signal) {
      if (signal.aborted) controller.abort();
      else
        signal.addEventListener('abort', () => controller.abort(), {
          once: true,
        });
    }
    return {
      signal: controller.signal,
      log: () => {},
      platform: process.platform,
      arch: process.arch,
    };
  }
}

function describeDetect(report: AgentDetectReport): string {
  const parts: string[] = [`${report.agentType}: ${report.status}`];
  if (report.version) parts.push(`v${report.version}`);
  if (report.executablePath) parts.push(report.executablePath);
  return parts.join(' ');
}

function describeDoctor(result: DoctorResult): string {
  const counts = result.checks.reduce(
    (acc, check) => ({ ...acc, [check.outcome]: (acc[check.outcome] ?? 0) + 1 }),
    {} as Record<string, number>,
  );
  const summary = Object.entries(counts)
    .map(([outcome, count]) => `${outcome}=${count}`)
    .join(', ');
  return `doctor ${result.overall} (${summary})`;
}

function shortSummary(message: string): string {
  const clean = message.replace(/\s+/g, ' ').trim();
  return clean.length > 200 ? `${clean.slice(0, 197)}…` : clean;
}

// re-export for command typing
export type { ManagementActionType };
