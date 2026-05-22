// Per-agent integration test for Codex.
// Skip unless AGENTOPS_E2E_AGENTS includes "codex" or "all".

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { CodexAdapter } from '../../src/adapters/codex.ts';

const allow = (process.env.AGENTOPS_E2E_AGENTS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase());
const enabled = allow.includes('codex') || allow.includes('all');

describe('CodexAdapter (integration)', { skip: !enabled }, () => {
  it('detect reports a stable status', async () => {
    const adapter = new CodexAdapter();
    const report = await adapter.detect({
      signal: new AbortController().signal,
      log: () => {},
      platform: process.platform,
      arch: process.arch,
    });
    assert.equal(report.agentType, 'codex');
    assert.ok(report.status);
  });
});
