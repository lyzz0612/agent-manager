#!/usr/bin/env node
// Dev wrapper around `agentops-runner`. Ensures the dev-only state dir is
// used (./.agentops-dev) and forwards remaining args to the CLI. When invoked
// with `--inside-container` it also auto-bootstraps the login against the
// Compose Server using AGENTOPS_TOKEN.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const insideContainer = args.includes('--inside-container');
const forwardArgs = args.filter((a) => a !== '--inside-container');

const env = { ...process.env };

if (!insideContainer) {
  env.AGENTOPS_DEV ??= '1';
  env.AGENTOPS_HOME ??= resolve(repoRoot, '.agentops-dev');
  mkdirSync(env.AGENTOPS_HOME, { recursive: true });
}

const cliEntry = resolve(repoRoot, 'cli/bin/agentops-runner.mjs');
if (!existsSync(cliEntry)) {
  console.error(`[dev-runner] missing CLI entry: ${cliEntry}`);
  process.exit(2);
}

async function maybeAutoLogin() {
  if (!insideContainer) return;
  const home = env.AGENTOPS_HOME ?? '/var/agentops';
  const credsPath = resolve(home, 'credentials.json');
  if (existsSync(credsPath)) {
    try {
      const creds = JSON.parse(readFileSync(credsPath, 'utf8'));
      if (creds?.runnerToken) return;
    } catch {}
  }

  const serverUrl =
    env.AGENTOPS_RUNNER_SERVER_URL ?? env.AGENTOPS_SERVER_URL ?? 'http://server:4000';
  const token = env.AGENTOPS_TOKEN;
  if (!token) {
    console.error('[dev-runner] AGENTOPS_TOKEN missing; cannot auto-login. Run `agentops-runner login ...` manually.');
    process.exit(3);
  }
  console.error(`[dev-runner] auto-login → ${serverUrl}`);
  await runOnce(['login', '--server', serverUrl, '--token', token, '--name', env.AGENTOPS_RUNNER_NAME ?? 'dev-runner']);
}

function runOnce(extraArgs) {
  return new Promise((resolveFn, reject) => {
    const child = spawn('node', [cliEntry, ...extraArgs], { env, stdio: 'inherit' });
    child.on('exit', (code, signal) => {
      if (code === 0) resolveFn();
      else reject(new Error(`agentops-runner ${extraArgs.join(' ')} exited code=${code} signal=${signal}`));
    });
  });
}

async function main() {
  await maybeAutoLogin();
  const finalArgs = forwardArgs.length > 0 ? forwardArgs : ['daemon'];
  console.error(`[dev-runner] AGENTOPS_HOME=${env.AGENTOPS_HOME ?? '<default>'}`);
  console.error(`[dev-runner] exec node ${cliEntry} ${finalArgs.join(' ')}`);
  const child = spawn('node', [cliEntry, ...finalArgs], { env, stdio: 'inherit' });
  const forward = (signal) => () => { try { child.kill(signal); } catch {} };
  process.on('SIGINT', forward('SIGINT'));
  process.on('SIGTERM', forward('SIGTERM'));
  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 130 : 1));
  });
}

main().catch((err) => {
  console.error('[dev-runner] fatal:', err.message || err);
  process.exit(1);
});
