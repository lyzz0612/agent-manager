import type { Machine } from '../api/types';

/**
 * Sort machines by online-first (online before offline), then by display name
 * (case-insensitive).
 *
 * Spec: openspec/changes/v1-client-management-ui/specs/client-management-ui/spec.md
 *       — "需求:机器列表"
 */
export function sortMachines<T extends Machine>(list: readonly T[]): T[] {
  const copy = [...list];
  copy.sort((a, b) => {
    const aOnline = a.status === 'online' ? 0 : 1;
    const bOnline = b.status === 'online' ? 0 : 1;
    if (aOnline !== bOnline) return aOnline - bOnline;
    return a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: 'base',
    });
  });
  return copy;
}
