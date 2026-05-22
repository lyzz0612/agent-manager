// Per-agent integration test for Claude Code.
// Skip unless AGENTOPS_E2E_AGENTS includes "claude-code" or "all".

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { ClaudeCodeAdapter } from '../../src/adapters/claude-code.ts';

const allow = (process.env.AGENTOPS_E2E_AGENTS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase());
const enabled = allow.includes('claude-code') || allow.includes('all');

describe('ClaudeCodeAdapter (integration)', { skip: !enabled }, () => {
  it('detect reports a stable status', async () => {
    const adapter = new ClaudeCodeAdapter();
    const report = await adapter.detect({
      signal: new AbortController().signal,
      log: () => {},
      platform: process.platform,
      arch: process.arch,
    });
    assert.equal(report.agentType, 'claude-code');
    assert.ok(report.status);
  });
});
