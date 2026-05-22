// Integration tests for the daemon connection. We stub the global WebSocket
// constructor with a tiny in-process implementation that lets us emit events
// and capture sent payloads without spinning up a real server.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { DaemonConnection } from '../src/daemon/connection.ts';
import { runDaemon } from '../src/commands/daemon.ts';
import { saveCredentials } from '../src/state/credentials.ts';
import { AdapterRegistry } from '../src/adapters/registry.ts';
import type { AgentAdapter, MutationResult } from '../src/adapters/types.ts';

class FakeWebSocket extends EventEmitter {
  static instances: FakeWebSocket[] = [];
  url: string;
  readyState = 0;
  sent: string[] = [];
  binaryType = 'arraybuffer';
  CONNECTING = 0;
  OPEN = 1;
  CLOSING = 2;
  CLOSED = 3;

  constructor(url: string | URL) {
    super();
    this.url = url.toString();
    FakeWebSocket.instances.push(this);
    setImmediate(() => this.open());
  }

  addEventListener(event: string, listener: (...args: unknown[]) => void): void {
    this.on(event, listener);
  }

  removeEventListener(event: string, listener: (...args: unknown[]) => void): void {
    this.off(event, listener);
  }

  open() {
    this.readyState = 1;
    this.emit('open', {});
  }

  send(data: string) {
    this.sent.push(data);
  }

  triggerMessage(payload: unknown) {
    this.emit('message', { data: JSON.stringify(payload) });
  }

  close(code = 1000, reason = '') {
    this.readyState = 3;
    this.emit('close', { code, reason });
  }
}

function makeAdapter(agentType: 'cursor' | 'codex' | 'claude-code'): AgentAdapter {
  return {
    agentType,
    displayName: agentType,
    docs: {
      install: { title: 't', url: 'https://example.test/i' },
      upgrade: { title: 't', url: 'https://example.test/u' },
      uninstall: { title: 't', url: 'https://example.test/x' },
    },
    detect: async () => ({
      agentType,
      status: 'installed',
      onPath: true,
      configFiles: [],
      auth: { kind: 'unknown' },
      version: '0.0.0',
      executablePath: '/bin/' + agentType,
      notes: [],
    }),
    install: async (): Promise<MutationResult> => ({
      ok: true,
      summary: 'ok',
    }),
    upgrade: async (): Promise<MutationResult> => ({ ok: true, summary: 'ok' }),
    uninstall: async (): Promise<MutationResult> => ({ ok: true, summary: 'ok' }),
    doctor: async () => ({
      overall: 'pass' as const,
      checks: [{ name: 'stub', outcome: 'pass' as const, message: 'ok' }],
    }),
  };
}

describe('DaemonConnection', () => {
  it('sends a hello message on open and heartbeats periodically', async () => {
    FakeWebSocket.instances.length = 0;
    const connection = new DaemonConnection({
      url: 'ws://test.example/api/v1/runner/ws',
      machineId: 'm_x',
      hostname: 'host',
      platform: 'linux',
      arch: 'x64',
      runnerVersion: '0.0.0',
      heartbeatIntervalMs: 5,
      webSocketCtor: FakeWebSocket as unknown as typeof globalThis.WebSocket,
    });
    connection.start();
    await new Promise((r) => setImmediate(r));
    const ws = FakeWebSocket.instances[0];
    assert.ok(ws);
    const helloMsg = ws!.sent.find((m) => m.includes('runner.hello'));
    assert.ok(helloMsg);
    await new Promise((r) => setTimeout(r, 30));
    const heartbeats = ws!.sent.filter((m) => m.includes('runner.heartbeat'));
    assert.ok(heartbeats.length >= 1);
    connection.stop();
  });

  it('marks credentials stale on server.auth_failure', async () => {
    FakeWebSocket.instances.length = 0;
    const connection = new DaemonConnection({
      url: 'ws://test.example/api/v1/runner/ws',
      machineId: 'm_x',
      hostname: 'host',
      platform: 'linux',
      arch: 'x64',
      runnerVersion: '0.0.0',
      webSocketCtor: FakeWebSocket as unknown as typeof globalThis.WebSocket,
    });
    const seen: string[] = [];
    connection.on('authFailure', (failure) => seen.push(failure.reason));
    connection.start();
    await new Promise((r) => setImmediate(r));
    const ws = FakeWebSocket.instances[0]!;
    ws.triggerMessage({
      type: 'server.auth_failure',
      reason: 'machine_deleted',
      message: 'gone',
    });
    assert.deepEqual(seen, ['machine_deleted']);
    assert.equal(connection.hasStaleCredentials(), true);
  });
});

describe('runDaemon()', () => {
  it('runs an auto-detect sweep after the connection opens', async () => {
    FakeWebSocket.instances.length = 0;
    const dir = mkdtempSync(join(tmpdir(), 'agentops-daemon-'));
    try {
      const credentialsFile = join(dir, 'credentials.json');
      saveCredentials(credentialsFile, {
        serverUrl: 'http://test.example',
        runnerToken: 'tok',
        machineId: 'm_test',
        registeredAt: new Date().toISOString(),
      });
      const paths = {
        root: dir,
        credentialsFile,
        logsDir: join(dir, 'logs'),
        cacheDir: join(dir, 'cache'),
        source: 'AGENTOPS_HOME' as const,
      };
      const registryFactory = () => {
        const r = new AdapterRegistry();
        r.register(makeAdapter('cursor'));
        r.register(makeAdapter('codex'));
        r.register(makeAdapter('claude-code'));
        return r;
      };
      const handle = runDaemon({
        paths,
        registryFactory,
        connectionFactory: (opts) =>
          new DaemonConnection({
            ...opts,
            platform: 'linux',
            arch: 'x64',
            webSocketCtor:
              FakeWebSocket as unknown as typeof globalThis.WebSocket,
          }),
        exitOnAuthFailure: false,
      });
      await new Promise((r) => setTimeout(r, 30));
      const ws = FakeWebSocket.instances[0]!;
      const reports = ws.sent.filter((m) => m.includes('runner.agent_report'));
      assert.equal(reports.length, 3);
      await handle.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
