import { sortMachines } from '../src/utils/sorting';
import type { Machine } from '../src/api/types';

function m(id: string, displayName: string, status: 'online' | 'offline'): Machine {
  return {
    id,
    displayName,
    hostname: `${id}.local`,
    os: 'linux',
    arch: 'amd64',
    status,
    lastSeenAt: null,
    registeredAt: new Date(0).toISOString(),
  };
}

describe('sortMachines', () => {
  it('places online machines before offline machines', () => {
    const result = sortMachines([
      m('a', 'A', 'offline'),
      m('b', 'B', 'online'),
      m('c', 'C', 'offline'),
      m('d', 'D', 'online'),
    ]);
    expect(result.map((it) => it.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('sorts alphabetically within the same status group', () => {
    const result = sortMachines([
      m('1', 'Charlie', 'online'),
      m('2', 'alpha', 'online'),
      m('3', 'Bravo', 'online'),
    ]);
    expect(result.map((it) => it.displayName)).toEqual(['alpha', 'Bravo', 'Charlie']);
  });

  it('does not mutate the input array', () => {
    const input = [m('a', 'A', 'offline'), m('b', 'B', 'online')];
    const before = input.map((it) => it.id);
    sortMachines(input);
    expect(input.map((it) => it.id)).toEqual(before);
  });
});
