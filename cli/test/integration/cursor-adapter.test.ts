// Per-agent integration test for the Cursor adapter.
//
// Skip conditions:
//   - AGENTOPS_E2E_AGENTS does not include "cursor".
//   - Running on an unsupported platform.
//
// These tests only run when explicitly opted in by setting
// `AGENTOPS_E2E_AGENTS=cursor` (or `all`). They never install or remove
// software on the host because v1 mandates the official installers handle that.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { CursorAdapter } from '../../src/adapters/cursor.ts';

const allow = (process.env.AGENTOPS_E2E_AGENTS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase());
const enabled = allow.includes('cursor') || allow.includes('all');

describe('CursorAdapter (integration)', { skip: !enabled }, () => {
  it('detect returns a consistent report for the current host', async () => {
    const adapter = new CursorAdapter();
    const ctx = {
      signal: new AbortController().signal,
      log: () => {},
      platform: process.platform,
      arch: process.arch,
    };
    const report = await adapter.detect(ctx);
    assert.equal(report.agentType, 'cursor');
    assert.ok(['installed', 'not_installed', 'misconfigured'].includes(report.status));
    if (report.onPath) {
      assert.ok(report.executablePath, 'onPath implies a resolved path');
    }
  });
});
