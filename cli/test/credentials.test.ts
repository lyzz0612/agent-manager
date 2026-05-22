import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
} from '../src/state/credentials.ts';
import { loadOrCreateMachineId } from '../src/state/machine-id.ts';

describe('credentials roundtrip', () => {
  it('saves and loads credentials', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentops-cred-'));
    const file = join(dir, 'credentials.json');
    try {
      const machineId = loadOrCreateMachineId(join(dir, 'machine-id'));
      assert.match(machineId, /^m_[0-9a-f]{32}$/);
      saveCredentials(file, {
        serverUrl: 'https://example.test',
        runnerToken: 't',
        machineId,
        registeredAt: new Date().toISOString(),
      });
      const loaded = loadCredentials(file);
      assert.ok(loaded);
      assert.equal(loaded?.machineId, machineId);
      assert.equal(loaded?.serverUrl, 'https://example.test');
      clearCredentials(file);
      assert.equal(loadCredentials(file), undefined);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns undefined for malformed files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentops-cred-bad-'));
    const file = join(dir, 'credentials.json');
    try {
      saveCredentials(file, {
        serverUrl: '',
        runnerToken: '',
        machineId: '',
      } as unknown as Parameters<typeof saveCredentials>[1]);
      const loaded = loadCredentials(file);
      assert.equal(loaded, undefined);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
