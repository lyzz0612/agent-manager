import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createDefaultRegistry } from '../src/adapters/registry.ts';
import { BUILTIN_AGENT_TYPES } from '../src/protocol/types.ts';

describe('AdapterRegistry', () => {
  it('registers Cursor, Codex and Claude Code by default', () => {
    const registry = createDefaultRegistry();
    assert.equal(registry.size(), 3);
    for (const agentType of BUILTIN_AGENT_TYPES) {
      const adapter = registry.require(agentType);
      assert.equal(adapter.agentType, agentType);
      assert.ok(adapter.docs.install.url.startsWith('https://'));
      assert.ok(adapter.docs.upgrade.url.startsWith('https://'));
      assert.ok(adapter.docs.uninstall.url.startsWith('https://'));
    }
  });

  it('throws on unknown agent', () => {
    const registry = createDefaultRegistry();
    assert.throws(
      () => registry.require('unknown' as unknown as 'cursor'),
      /No adapter registered/,
    );
  });
});
