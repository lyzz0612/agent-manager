import { useCallback, useEffect, useState } from 'react';
import type { ManagementAction } from '../api/types';
import { useAuth } from '../store/auth';
import { useEventListener } from '../store/events';
import { describeError } from '../api/errors';

interface UseActionResult {
  action: ManagementAction | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAction(machineId: string, actionId: string): UseActionResult {
  const { api } = useAuth();
  const [action, setAction] = useState<ManagementAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.getAction(machineId, actionId);
      setAction(result);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [api, machineId, actionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEventListener((event) => {
    if (event.type === 'action.updated' && event.action.id === actionId) {
      setAction(event.action);
    }
  });

  return { action, loading, error, refresh: load };
}
