// Per-agent serial queue. Different agents run in parallel (no shared state),
// but actions for the same agent are chained so a second action only starts
// after the previous one has settled. v1 does not support cancellation.

import type { AgentType } from '../protocol/types.ts';

export interface QueueStats {
  agentType: AgentType;
  pending: number;
  running: boolean;
}

interface ChainEntry {
  pending: number;
  tail: Promise<unknown>;
}

export class PerAgentSerialQueue {
  private readonly chains = new Map<AgentType, ChainEntry>();

  enqueue<T>(agentType: AgentType, work: () => Promise<T>): Promise<T> {
    const existing = this.chains.get(agentType);
    const previous = existing?.tail ?? Promise.resolve();
    const entry: ChainEntry = existing ?? { pending: 0, tail: previous };
    entry.pending += 1;
    this.chains.set(agentType, entry);

    const next = previous.then(
      () => work(),
      () => work(),
    );

    entry.tail = next.finally(() => {
      entry.pending -= 1;
      if (entry.pending <= 0 && this.chains.get(agentType)?.tail === entry.tail) {
        this.chains.delete(agentType);
      }
    });

    return next;
  }

  stats(): QueueStats[] {
    return [...this.chains.entries()].map(([agentType, entry]) => ({
      agentType,
      pending: entry.pending,
      running: entry.pending > 0,
    }));
  }
}
