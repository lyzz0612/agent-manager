// Default timeouts for action types. The executor enforces these regardless of
// what the server sends; if the server provides a smaller value, that wins.

import type { ManagementActionType } from '../protocol/types.ts';

const ONE_SECOND = 1_000;

export const DEFAULT_TIMEOUTS_MS: Record<ManagementActionType, number> = {
  detect: 30 * ONE_SECOND,
  install: 10 * 60 * ONE_SECOND,
  upgrade: 10 * 60 * ONE_SECOND,
  doctor: 60 * ONE_SECOND,
  uninstall: 5 * 60 * ONE_SECOND,
};

export function resolveTimeout(
  actionType: ManagementActionType,
  requested?: number,
): number {
  const fallback = DEFAULT_TIMEOUTS_MS[actionType];
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) {
    return fallback;
  }
  return Math.min(fallback, requested);
}
