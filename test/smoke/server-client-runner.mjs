#!/usr/bin/env node
// Smoke test: boot Server (in-memory DB), spawn the agentops-runner CLI
// against it, assert the runner registered a machine and reported >=0 agents.
//
// Requires:
//   * @agentops/server built (server/dist/index.js)
//   * @lyzz0612/agentops-runner CLI shipped (cli/bin/agentops-runner.mjs;
//     falls back to TS source via Node's --experimental-strip-types).
//
// Designed to run without Docker; CI uses the same entrypoint.

import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const repoRoot = resolve(import.meta.dirname, '..', '..');

async function main() {
  const TOKEN = process.env.AGENTOPS_TOKEN ?? 'smoke-test-token';
  const serverBuilt = resolve(repoRoot, 'server/dist/app.js');
  if (!existsSync(serverBuilt)) {
    console.error('[smoke] expected built server at server/dist/app.js');
    console.error('[smoke] run: pnpm --filter @agentops/server build');
    process.exit(2);
  }

  process.env.AGENTOPS_TOKEN = TOKEN;
  process.env.AGENTOPS_LOG_LEVEL = process.env.AGENTOPS_LOG_LEVEL ?? 'warn';

  // Import the built server in-process so we can read DB state directly.
  const { createApp } = await import(pathToFileUrl(serverBuilt));
  const ctx = await createApp({ dbPath: ':memory:', requireToken: true });
  const address = await ctx.http.listen({ host: '127.0.0.1', port: 0 });
  console.error(`[smoke] server listening at ${address}`);

  const runnerHome = mkdtempSync(join(tmpdir(), 'agentops-smoke-'));
  let runnerProc;

  try {
    const cliBin = resolve(repoRoot, 'cli/bin/agentops-runner.mjs');
    if (!existsSync(cliBin)) {
      throw new Error(`expected runner CLI at ${cliBin}`);
    }

    const env = {
      ...process.env,
      AGENTOPS_HOME: runnerHome,
      AGENTOPS_DEV: '1',
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS ?? '',
        '--experimental-strip-types',
        '--no-warnings=ExperimentalWarning',
      ].filter(Boolean).join(' '),
    };

    console.error('[smoke] runner login');
    // IMPORTANT: must be async (spawn, not spawnSync) — the parent process
    // hosts the in-memory Fastify server, so blocking the event loop with
    // spawnSync would deadlock on the child's fetch round-trip.
    const loginCode = await spawnAsync('node', [cliBin, 'login', '--server', address, '--token', TOKEN, '--name', 'smoke-runner'], { env });
    if (loginCode !== 0) {
      throw new Error(`login exited with ${loginCode}`);
    }

    console.error('[smoke] runner daemon');
    runnerProc = spawn('node', [cliBin, 'daemon'], { env, stdio: 'inherit' });

    await waitForMachine(ctx, { timeoutMs: 8000 });
    console.error('[smoke] OK — runner registered, server saw report');
  } finally {
    if (runnerProc) {
      runnerProc.kill('SIGINT');
      await new Promise((r) => setTimeout(r, 200));
    }
    await ctx.close();
    rmSync(runnerHome, { recursive: true, force: true });
  }
}

async function waitForMachine(ctx, { timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const machines = ctx.machines.listVisible();
    if (machines.length > 0) {
      const reports = ctx.agents.listForMachine(machines[0].id);
      assert.ok(Array.isArray(reports), 'agent reports must be an array');
      return;
    }
    await sleep(200);
  }
  throw new Error('runner failed to register a machine within timeout');
}

function pathToFileUrl(p) {
  return `file:///${p.replace(/\\/g, '/').replace(/^\/+/, '')}`;
}

function spawnAsync(cmd, args, options) {
  return new Promise((resolveFn, rejectFn) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...options });
    child.on('error', rejectFn);
    child.on('exit', (code) => resolveFn(code ?? 1));
  });
}

main().catch((err) => {
  console.error('[smoke] FAILED:', err?.stack ?? err);
  process.exit(1);
});
