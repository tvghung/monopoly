import { describe, expect, it } from 'vitest';
import type { RoomPlayerMeta } from '@monopoly/shared';
import { resolvePlayerStationSlots } from './stationSlots';

const player = (
  playerId: string,
  joinOrder: number,
  membershipStatus: RoomPlayerMeta['membershipStatus'] = 'ACTIVE',
): RoomPlayerMeta => ({
  playerId,
  joinOrder,
  membershipStatus,
  name: playerId,
  color: 'red',
  characterId: 'dog',
  ready: true,
  connected: membershipStatus === 'ACTIVE',
});

const entries = (slots: Map<string, string>) => Object.fromEntries(slots);

describe('player station seat resolver', () => {
  it('places the local player at the bottom and the two-player opponent at the top', () => {
    expect(entries(resolvePlayerStationSlots([
      player('a', 1), player('b', 2),
    ], 'b', 'PLAYER'))).toEqual({ b: 'BOTTOM', a: 'TOP' });
  });

  it('uses cyclic seat order for three players and leaves RIGHT empty', () => {
    expect(entries(resolvePlayerStationSlots([
      player('a', 1), player('b', 2), player('c', 3),
    ], 'b', 'PLAYER'))).toEqual({ b: 'BOTTOM', c: 'TOP', a: 'LEFT' });
  });

  it('uses TOP, LEFT, RIGHT deterministically for four-player opponents', () => {
    expect(entries(resolvePlayerStationSlots([
      player('d', 4), player('b', 2), player('a', 1), player('c', 3),
    ], 'c', 'PLAYER'))).toEqual({ c: 'BOTTOM', d: 'TOP', a: 'LEFT', b: 'RIGHT' });
  });

  it('uses canonical join order for spectators', () => {
    expect(entries(resolvePlayerStationSlots([
      player('c', 3), player('a', 1), player('b', 2), player('d', 4),
    ], null, 'SPECTATOR'))).toEqual({ a: 'BOTTOM', b: 'TOP', c: 'LEFT', d: 'RIGHT' });
  });

  it('retains an inactive member in the same station instead of reflowing slots', () => {
    const before = entries(resolvePlayerStationSlots([
      player('a', 1), player('b', 2), player('c', 3),
    ], 'a', 'PLAYER'));
    const after = entries(resolvePlayerStationSlots([
      player('a', 1), player('b', 2, 'LEFT'), player('c', 3),
    ], 'a', 'PLAYER'));
    expect(after).toEqual(before);
    expect(after.b).toBe('TOP');
  });
});
