// Persist Runner credentials and machine identity in a single JSON file under
// the resolved state directory. v1 stores only what is strictly necessary:
// Server URL, runner token, machineId, optional displayName and the timestamp
// of the last successful handshake.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

export interface RunnerCredentials {
  serverUrl: string;
  runnerToken: string;
  machineId: string;
  displayName?: string;
  registeredAt?: string;
  /** Set by `login` so daemon can detect when credentials are stale. */
  loginToken?: string;
}

export function loadCredentials(path: string): RunnerCredentials | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const raw = readFileSync(path, 'utf8');
    const obj = JSON.parse(raw) as Partial<RunnerCredentials>;
    if (!obj || !obj.serverUrl || !obj.runnerToken || !obj.machineId) {
      return undefined;
    }
    return obj as RunnerCredentials;
  } catch {
    return undefined;
  }
}

export function saveCredentials(
  path: string,
  credentials: RunnerCredentials,
): void {
  mkdirSync(dirname(path), { recursive: true });
  const payload = JSON.stringify(credentials, null, 2);
  writeFileSync(path, payload, { mode: 0o600 });
}

export function clearCredentials(path: string): void {
  if (!existsSync(path)) return;
  writeFileSync(path, '{}\n', { mode: 0o600 });
}
