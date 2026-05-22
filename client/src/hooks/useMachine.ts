import { useCallback, useEffect, useState } from 'react';
import type { AgentSummary, Machine } from '../api/types';
import { useAuth } from '../store/auth';
import { useEventListener } from '../store/events';
import { describeError } from '../api/errors';

interface UseMachineResult {
  machine: Machine | null;
  agents: AgentSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMachine(machineId: string): UseMachineResult {
  const { api } = useAuth();
  const [machine, setMachine] = useState<Machine | null>(null);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!api) return;
    setLoading(true);
    setError(null);
    try {
      const [m, a] = await Promise.all([
        api.getMachine(machineId),
        api.listAgents(machineId),
      ]);
      setMachine(m);
      setAgents(a.agents ?? []);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [api, machineId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEventListener((event) => {
    if (event.type === 'machine.status' && event.machineId === machineId) {
      setMachine((prev) => (prev ? { ...prev, status: event.status, lastSeenAt: event.at } : prev));
    } else if (event.type === 'machine.updated' && event.machine.id === machineId) {
      setMachine(event.machine);
    } else if (event.type === 'agent.updated' && event.machineId === machineId) {
      setAgents((prev) => {
        const next = prev.some((a) => a.type === event.agent.type)
          ? prev.map((a) => (a.type === event.agent.type ? { ...a, ...event.agent } : a))
          : [...prev, event.agent as AgentSummary];
        return next;
      });
    }
  });

  return { machine, agents, loading, error, refresh: load };
}
