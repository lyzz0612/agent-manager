import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensurePaths, resolvePaths } from '../src/state/paths.ts';

describe('resolvePaths', () => {
  it('honours AGENTOPS_HOME when explicitly set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentops-paths-'));
    try {
      const ctx = resolvePaths({ AGENTOPS_HOME: dir }, tmpdir());
      assert.equal(ctx.source, 'AGENTOPS_HOME');
      assert.equal(ctx.root, dir);
      assert.equal(ctx.credentialsFile, join(dir, 'credentials.json'));
      ensurePaths(ctx);
      assert.equal(existsSync(ctx.logsDir), true);
      assert.equal(existsSync(ctx.cacheDir), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to home default outside a checkout', () => {
    const fakeCwd = mkdtempSync(join(tmpdir(), 'agentops-paths-out-'));
    try {
      const ctx = resolvePaths({}, fakeCwd);
      assert.notEqual(ctx.source, 'AGENTOPS_HOME');
      // Either dev-default (if executed from the repo checkout) or home-default
      assert.ok(['dev-default', 'home-default'].includes(ctx.source));
    } finally {
      rmSync(fakeCwd, { recursive: true, force: true });
    }
  });

  it('uses dev-default when AGENTOPS_DEV=1 inside the repo', () => {
    const ctx = resolvePaths({ AGENTOPS_DEV: '1' }, process.cwd());
    assert.equal(ctx.source, 'dev-default');
    assert.ok(ctx.root.endsWith('.agentops-dev'));
  });
});
