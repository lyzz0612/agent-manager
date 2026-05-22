#!/usr/bin/env node
// Dev launcher for the Server / Client / Runner matrix.
//
// Driven by environment variables:
//   SERVER_RUNTIME=local|docker|off   (default: local)
//   CLIENT_RUNTIME=local|docker|off   (default: local)
//   RUNNER_RUNTIME=local|docker|off   (default: docker)
//
// Examples:
//   node scripts/dev.mjs                              # recommended combo
//   SERVER_RUNTIME=local CLIENT_RUNTIME=local RUNNER_RUNTIME=local node scripts/dev.mjs
//   SERVER_RUNTIME=docker CLIENT_RUNTIME=docker RUNNER_RUNTIME=docker node scripts/dev.mjs
//
// The script intentionally fails fast: if `docker compose` is missing, the
// user is told to install Docker Desktop / Engine instead of silently dropping
// the runner.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');

const matrix = {
  server: (process.env.SERVER_RUNTIME ?? 'local').toLowerCase(),
  client: (process.env.CLIENT_RUNTIME ?? 'local').toLowerCase(),
  runner: (process.env.RUNNER_RUNTIME ?? 'docker').toLowerCase(),
};

for (const [name, mode] of Object.entries(matrix)) {
  if (!['local', 'docker', 'off'].includes(mode)) {
    console.error(`[dev] invalid ${name.toUpperCase()}_RUNTIME=${mode} (use local|docker|off)`);
    process.exit(2);
  }
}

const profiles = [];
if (matrix.server === 'docker') profiles.push('server');
if (matrix.client === 'docker') profiles.push('client');
if (matrix.runner === 'docker') profiles.push('runner');

const children = [];
const exit = (code) => {
  for (const child of children) {
    try {
      child.kill('SIGINT');
    } catch {}
  }
  process.exit(code);
};
process.on('SIGINT', () => exit(0));
process.on('SIGTERM', () => exit(0));

function launch(label, command, args, options = {}) {
  console.error(`[dev] ${label}: ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: repoRoot,
    ...options,
  });
  child.on('exit', (code, signal) => {
    console.error(`[dev] ${label} exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    exit(code ?? 1);
  });
  children.push(child);
}

// Local processes: launched via pnpm filters so they share the workspace.
if (matrix.server === 'local') {
  launch('server (local)', 'pnpm', ['--filter', '@agentops/server', 'dev']);
}
if (matrix.client === 'local') {
  launch('client (local)', 'pnpm', ['--filter', '@agent-manager/client', 'web']);
}
if (matrix.runner === 'local') {
  launch('runner (local)', 'node', [resolve(repoRoot, 'scripts/dev-runner.mjs')]);
}

// Docker stack: combine base + dev overlay, activate the selected profiles.
if (profiles.length > 0) {
  if (!existsSync(resolve(repoRoot, 'docker-compose.yml'))) {
    console.error('[dev] docker-compose.yml missing');
    exit(1);
  }
  const args = [
    'compose',
    '-f', 'docker-compose.yml',
    '-f', 'docker-compose.dev.yml',
  ];
  for (const profile of profiles) args.push('--profile', profile);
  args.push('up', '--build');
  launch(`docker compose (profiles: ${profiles.join(',')})`, 'docker', args);
}

if (children.length === 0) {
  console.error('[dev] nothing to launch — all runtimes set to off');
  process.exit(1);
}
