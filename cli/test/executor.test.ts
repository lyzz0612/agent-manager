// Executor tests use a stub adapter registry so we don't need the real Cursor,
// Codex, or Claude binaries to be installed on the test runner.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { AdapterRegistry } from '../src/adapters/registry.ts';
import type {
  AdapterContext,
  AgentAdapter,
  MutationResult,
} from '../src/adapters/types.ts';
import type {
  AgentDetectReport,
  DoctorResult,
} from '../src/protocol/types.ts';
import { ActionExecutor } from '../src/executor/executor.ts';

class StubAdapter implements AgentAdapter {
  readonly agentType: 'cursor' | 'codex' | 'claude-code';
  readonly displayName: string;
  readonly docs = {
    install: { title: 'stub', url: 'https://example.test/install' },
    upgrade: { title: 'stub', url: 'https://example.test/upgrade' },
    uninstall: { title: 'stub', url: 'https://example.test/uninstall' },
  };
  calls: string[] = [];
  mutationResult: MutationResult = { ok: true, summary: 'done' };
  detectReport?: AgentDetectReport;
  installHang = false;

  constructor(
    agentType: 'cursor' | 'codex' | 'claude-code',
    displayName = agentType,
  ) {
    this.agentType = agentType;
    this.displayName = displayName;
  }

  async detect(_ctx: AdapterContext): Promise<AgentDetectReport> {
    this.calls.push('detect');
    return (
      this.detectReport ?? {
        agentType: this.agentType,
        status: 'installed',
        onPath: true,
        configFiles: [],
        auth: { kind: 'unknown' },
        notes: [],
        version: '0.1.0',
        executablePath: '/usr/local/bin/' + this.agentType,
      }
    );
  }

  async install(ctx: AdapterContext): Promise<MutationResult> {
    this.calls.push('install');
    if (this.installHang) {
      await new Promise((resolve) => {
        ctx.signal.addEventListener('abort', () => resolve(undefined));
      });
      throw new Error('aborted');
    }
    return this.mutationResult;
  }

  async upgrade(_ctx: AdapterContext): Promise<MutationResult> {
    this.calls.push('upgrade');
    return this.mutationResult;
  }

  async uninstall(_ctx: AdapterContext): Promise<MutationResult> {
    this.calls.push('uninstall');
    return this.mutationResult;
  }

  async doctor(_ctx: AdapterContext): Promise<DoctorResult> {
    this.calls.push('doctor');
    return {
      overall: 'pass',
      checks: [{ name: 'stub', outcome: 'pass', message: 'ok' }],
    };
  }
}

function makeExecutor(adapters: StubAdapter[]) {
  const registry = new AdapterRegistry();
  for (const adapter of adapters) registry.register(adapter);
  return new ActionExecutor({ registry, machineId: 'm_test' });
}

describe('ActionExecutor', () => {
  it('runs detect and returns a follow-up report', async () => {
    const cursor = new StubAdapter('cursor');
    const executor = makeExecutor([cursor]);
    const { result, followUpReport } = await executor.execute({
      type: 'server.action',
      actionId: 'a1',
      agentType: 'cursor',
      actionType: 'detect',
    });
    assert.equal(result.state, 'succeeded');
    assert.equal(result.agentType, 'cursor');
    assert.match(result.summary, /cursor: installed/);
    assert.ok(followUpReport);
    assert.equal(followUpReport?.report.status, 'installed');
  });

  it('runs install and triggers a follow-up detect', async () => {
    const codex = new StubAdapter('codex');
    const executor = makeExecutor([codex]);
    const { result, followUpReport } = await executor.execute({
      type: 'server.action',
      actionId: 'a2',
      agentType: 'codex',
      actionType: 'install',
    });
    assert.equal(result.state, 'succeeded');
    assert.deepEqual(codex.calls, ['install', 'detect']);
    assert.ok(followUpReport);
  });

  it('reports failure when adapter mutation reports !ok', async () => {
    const cursor = new StubAdapter('cursor');
    cursor.mutationResult = { ok: false, summary: 'install error' };
    const executor = makeExecutor([cursor]);
    const { result } = await executor.execute({
      type: 'server.action',
      actionId: 'a3',
      agentType: 'cursor',
      actionType: 'install',
    });
    assert.equal(result.state, 'failed');
    assert.equal(result.summary, 'install error');
  });

  it('detectAll fans out to every adapter', async () => {
    const cursor = new StubAdapter('cursor');
    const codex = new StubAdapter('codex');
    const claude = new StubAdapter('claude-code');
    const executor = makeExecutor([cursor, codex, claude]);
    const reports = await executor.detectAll();
    assert.equal(reports.length, 3);
    for (const report of reports) {
      assert.equal(report.source, 'auto_detect');
    }
  });

  it('enforces timeout and reports failure', async () => {
    const cursor = new StubAdapter('cursor');
    cursor.installHang = true;
    const executor = makeExecutor([cursor]);
    const { result } = await executor.execute({
      type: 'server.action',
      actionId: 'a4',
      agentType: 'cursor',
      actionType: 'install',
      timeoutMs: 25,
    });
    assert.equal(result.state, 'failed');
    assert.match(result.summary, /timed out|aborted/);
  });

  it('does not expose any cancel() entrypoint (v1 contract)', () => {
    const executor = makeExecutor([new StubAdapter('cursor')]);
    assert.equal(
      (executor as unknown as Record<string, unknown>).cancel,
      undefined,
    );
  });
});
