import { useCallback, useEffect, useState } from 'react';
import type { Machine } from '../api/types';
import { useAuth } from '../store/auth';
import { useEventListener } from '../store/events';
import { sortMachines } from '../utils/sorting';
import { describeError } from '../api/errors';

interface UseMachinesResult {
  machines: Machine[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMachines(): UseMachinesResult {
  const { api } = useAuth();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh'): Promise<void> => {
      if (!api) return;
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const result = await api.listMachines();
        setMachines(sortMachines(result.machines ?? []));
      } catch (err) {
        setError(describeError(err));
      } finally {
        if (mode === 'initial') setLoading(false);
        else setRefreshing(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  useEventListener((event) => {
    if (event.type === 'machine.status') {
      setMachines((prev) =>
        sortMachines(
          prev.map((m) =>
            m.id === event.machineId
              ? { ...m, status: event.status, lastSeenAt: event.at }
              : m,
          ),
        ),
      );
    } else if (event.type === 'machine.updated') {
      setMachines((prev) => {
        const exists = prev.some((m) => m.id === event.machine.id);
        const next = exists
          ? prev.map((m) => (m.id === event.machine.id ? event.machine : m))
          : [...prev, event.machine];
        return sortMachines(next);
      });
    } else if (event.type === 'machine.deleted') {
      setMachines((prev) => prev.filter((m) => m.id !== event.machineId));
    }
  });

  return {
    machines,
    loading,
    refreshing,
    error,
    refresh: () => load('refresh'),
  };
}
