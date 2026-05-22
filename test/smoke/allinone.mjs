#!/usr/bin/env node
// All-in-one smoke: build the all-in-one image, boot it, hit /healthz, then
// assert the bundled runner did NOT pre-install Cursor / Codex / Claude Code.
//
// Requires Docker. Skips itself (exit 0 with a clear log message) if Docker is
// not available, so the script is safe to wire into `pnpm smoke:allinone` in
// every contributor's environment.

import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const IMAGE = process.env.ALLINONE_IMAGE ?? 'agentops-server:smoke-allinone';
const TOKEN = 'allinone-smoke-token';
const PORT = process.env.ALLINONE_PORT ?? '18080';

function exec(cmd, args, options = {}) {
  return new Promise((resolveFn) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...options });
    child.on('exit', (code, signal) => resolveFn({ code: code ?? (signal ? 130 : 1) }));
  });
}

function execCapture(cmd, args, options = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', ...options });
}

async function main() {
  const docker = execCapture('docker', ['--version']);
  if (docker.status !== 0) {
    console.error('[smoke:allinone] docker not available; skipping');
    return;
  }

  console.error(`[smoke:allinone] building ${IMAGE}`);
  const build = await exec(
    'docker',
    ['build', '-f', 'server/Dockerfile.allinone', '-t', IMAGE, '--build-arg', 'VERSION=smoke', '.'],
    { cwd: repoRoot },
  );
  if (build.code !== 0) {
    console.error('[smoke:allinone] docker build failed');
    process.exit(build.code);
  }

  const containerName = `agentops-allinone-smoke-${Date.now()}`;
  console.error(`[smoke:allinone] running container ${containerName}`);
  const run = await exec(
    'docker',
    [
      'run',
      '-d',
      '--rm',
      '--name', containerName,
      '-p', `${PORT}:4000`,
      '-e', `AGENTOPS_TOKEN=${TOKEN}`,
      IMAGE,
    ],
    { cwd: repoRoot },
  );
  if (run.code !== 0) {
    console.error('[smoke:allinone] docker run failed');
    process.exit(run.code);
  }

  try {
    await waitForHealth(`http://127.0.0.1:${PORT}/healthz`);
    console.error('[smoke:allinone] /healthz OK');

    // Server smoke
    const authRes = await fetch(`http://127.0.0.1:${PORT}/api/auth/check`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    if (!authRes.ok) throw new Error(`auth check failed: ${authRes.status}`);
    const auth = await authRes.json();
    if (!Array.isArray(auth.supportedAgents)) {
      throw new Error('auth response missing supportedAgents');
    }
    console.error(`[smoke:allinone] auth.check supportedAgents=${auth.supportedAgents.join(',')}`);

    // Runner bundled but no agents pre-installed.
    assertNotPreinstalled(containerName, 'cursor');
    assertNotPreinstalled(containerName, 'codex');
    assertNotPreinstalled(containerName, 'claude-code');
    assertNotPreinstalled(containerName, 'claude');

    // Bundled runner CLI exists.
    const exists = execCapture('docker', ['exec', containerName, 'test', '-x', '/app/cli/bin/agentops-runner.mjs']);
    if (exists.status !== 0) {
      throw new Error('bundled runner CLI missing in /app/cli/bin/agentops-runner.mjs');
    }
    console.error('[smoke:allinone] bundled runner CLI present');

    console.error('[smoke:allinone] OK');
  } finally {
    execCapture('docker', ['rm', '-f', containerName]);
  }
}

async function waitForHealth(url) {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`${url} did not become healthy`);
}

function assertNotPreinstalled(container, bin) {
  const res = execCapture('docker', ['exec', container, 'sh', '-lc', `command -v ${bin} || true`]);
  const out = (res.stdout || '').trim();
  if (out.length > 0) {
    throw new Error(`Agent CLI ${bin} should NOT be pre-installed in the all-in-one image, but found at: ${out}`);
  }
}

main().catch((err) => {
  console.error('[smoke:allinone] FAILED:', err?.stack ?? err);
  process.exit(1);
});
