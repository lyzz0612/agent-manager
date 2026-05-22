#!/usr/bin/env node
// Run the Runner per-agent integration suite.
//
// Tests are skipped per-agent unless AGENTOPS_E2E_AGENTS lists them. This
// wrapper is shared by `pnpm test:runner:integration` (local) and the CI
// smoke job — it does not depend on Docker.
//
// Common usage:
//   pnpm test:runner:integration                         # all skipped
//   AGENTOPS_E2E_AGENTS=cursor pnpm test:runner:integration
//   AGENTOPS_E2E_AGENTS=all pnpm test:runner:integration

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const cliDir = resolve(repoRoot, 'cli');

if (!existsSync(join(cliDir, 'package.json'))) {
  console.error('[runner-integration] cli/package.json missing');
  process.exit(2);
}

// Isolate state in a throwaway tempdir so the suite cannot pollute the host
// even if a test forgets to override AGENTOPS_HOME.
const env = { ...process.env };
env.AGENTOPS_HOME ??= mkdtempSync(join(tmpdir(), 'agentops-it-'));
env.AGENTOPS_DEV ??= '1';

const child = spawn('pnpm', ['--filter', '@lyzz0612/agentops-runner', 'test:integration'], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 130 : 1));
});
