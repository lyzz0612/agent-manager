// Adapter registry. v1 builds in three adapters but the registry is mutable so
// tests can substitute fakes and future agents can be added without touching
// the executor.

import type { AgentType } from '../protocol/types.ts';
import type { AgentAdapter } from './types.ts';
import { CursorAdapter } from './cursor.ts';
import { CodexAdapter } from './codex.ts';
import { ClaudeCodeAdapter } from './claude-code.ts';

export class AdapterRegistry {
  private readonly adapters = new Map<AgentType, AgentAdapter>();

  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.agentType, adapter);
  }

  get(agentType: AgentType): AgentAdapter | undefined {
    return this.adapters.get(agentType);
  }

  require(agentType: AgentType): AgentAdapter {
    const adapter = this.adapters.get(agentType);
    if (!adapter) {
      throw new Error(`No adapter registered for agent type "${agentType}"`);
    }
    return adapter;
  }

  list(): AgentAdapter[] {
    return [...this.adapters.values()];
  }

  has(agentType: AgentType): boolean {
    return this.adapters.has(agentType);
  }

  size(): number {
    return this.adapters.size;
  }
}

export function createDefaultRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();
  registry.register(new CursorAdapter());
  registry.register(new CodexAdapter());
  registry.register(new ClaudeCodeAdapter());
  return registry;
}
