import { describe, expect, it } from 'vitest';
import type { RoomPlayerMeta } from '@monopoly/shared';
import { resolvePlayerStationSlots } from './stationSlots';

const player = (
  playerId: string,
  joinOrder: number,
  membershipStatus: RoomPlayerMeta['membershipStatus'] = 'ACTIVE',
): RoomPlayerMeta => ({
  teamId: 'TEAM_1',
  teamSlot: 0,
  playerId,
  joinOrder,
  membershipStatus,
  name: playerId,
  color: 'red',
  characterId: 'dog',
  ready: true,
  connected: membershipStatus === 'ACTIVE', kind: 'HUMAN' as const,
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

describe('player station seat resolver in a 2v2 game', () => {
  const seat = (playerId: string, joinOrder: number, teamId: 'TEAM_1' | 'TEAM_2'): RoomPlayerMeta => ({
    ...player(playerId, joinOrder), teamId,
  });
  // Join order alternates the teams, as the server deals the turn order: a, b, c, d = Team 1, Team 2, Team 1, Team 2.
  const four = [seat('a', 1, 'TEAM_1'), seat('b', 2, 'TEAM_2'), seat('c', 3, 'TEAM_1'), seat('d', 4, 'TEAM_2')];

  it('puts the viewer and their teammate on the left half and the opponents on the right half', () => {
    expect(entries(resolvePlayerStationSlots(four, 'a', 'PLAYER', true))).toEqual({
      a: 'BOTTOM', c: 'LEFT', b: 'TOP', d: 'RIGHT',
    });
    expect(entries(resolvePlayerStationSlots(four, 'd', 'PLAYER', true))).toEqual({
      d: 'BOTTOM', b: 'LEFT', a: 'TOP', c: 'RIGHT',
    });
  });

  it('shows a spectator Team 1 on the left and Team 2 on the right', () => {
    expect(entries(resolvePlayerStationSlots(four, null, 'SPECTATOR', true))).toEqual({
      a: 'BOTTOM', c: 'LEFT', b: 'TOP', d: 'RIGHT',
    });
  });

  it('keeps an eliminated member in the same station so the card does not jump', () => {
    const before = entries(resolvePlayerStationSlots(four, 'a', 'PLAYER', true));
    const after = entries(resolvePlayerStationSlots(
      [four[0], { ...four[1], membershipStatus: 'FINISHED' }, four[2], four[3]],
      'a',
      'PLAYER',
      true,
    ));
    expect(after).toEqual(before);
  });

  it('leaves Solo seating untouched when team mode is off', () => {
    expect(entries(resolvePlayerStationSlots(four, 'a', 'PLAYER'))).toEqual({ a: 'BOTTOM', b: 'TOP', c: 'LEFT', d: 'RIGHT' });
  });
});
