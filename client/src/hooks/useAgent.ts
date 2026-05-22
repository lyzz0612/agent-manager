import { useCallback, useEffect, useState } from 'react';
import type { AgentDetail } from '../api/types';
import { useAuth } from '../store/auth';
import { useEventListener } from '../store/events';
import { describeError } from '../api/errors';

interface UseAgentResult {
  agent: AgentDetail | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAgent(machineId: string, agentType: string): UseAgentResult {
  const { api } = useAuth();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.getAgent(machineId, agentType);
      setAgent(result);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [api, machineId, agentType]);

  useEffect(() => {
    void load();
  }, [load]);

  useEventListener((event) => {
    if (
      event.type === 'agent.updated' &&
      event.machineId === machineId &&
      event.agent.type === agentType
    ) {
      setAgent((prev) =>
        prev ? { ...prev, ...(event.agent as Partial<AgentDetail>) } : prev,
      );
    }
  });

  return { agent, loading, error, refresh: load };
}
