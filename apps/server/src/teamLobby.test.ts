import { describe, expect, it } from 'vitest';
import type { PlayerId, TeamId, TeamSlot } from '@monopoly/shared';

import {
  activeTeamMembers,
  dropSeatSwapRequestsOf,
  getTeamStartBlockReason,
  movePlayerToSeat,
  normalizeTeamSlots,
  swapPlayerSeats,
} from './teamLobby.js';
import {
  createFreshPlayer,
  createRoomSnapshot,
  hydrateGameState,
  type RoomSnapshot,
} from './rooms.js';

const A = 'a';
const B = 'b';
const C = 'c';
const D = 'd';

/** A 2v2 lobby: a (T1/0, dog), b (T2/0, dog), c (T1/1, cat), d (T2/1, panda); everybody Ready. */
function lobby(): RoomSnapshot {
  const snapshot = createRoomSnapshot();
  snapshot.gameState.boardState.gameMode = 'TEAM_2V2';
  const seats: Array<[PlayerId, TeamId, TeamSlot, 'dog' | 'cat' | 'panda']> = [
    [A, 'TEAM_1', 0, 'dog'], [B, 'TEAM_2', 0, 'dog'], [C, 'TEAM_1', 1, 'cat'], [D, 'TEAM_2', 1, 'panda'],
  ];
  seats.forEach(([id, teamId, slot, mascot], index) => {
    snapshot.members[id] = { joinOrder: index + 1, ready: true, membershipStatus: 'ACTIVE' };
    snapshot.gameState.players[id] = createFreshPlayer(id, snapshot.gameState.boardState.teams[teamId].color, mascot, teamId, slot);
  });
  snapshot.nextJoinOrder = 5;
  snapshot.gameState.boardState.players = [A, B, C, D];
  return snapshot;
}

const withDraft = <Result>(snapshot: RoomSnapshot, run: (state: ReturnType<typeof hydrateGameState>) => Result): Result => {
  const state = hydrateGameState(snapshot, 'LOBBY');
  return run(state);
};

describe('seat order inside a team', () => {
  it('lists a team\'s members by seat, not by join order', () => {
    const snapshot = lobby();
    snapshot.gameState.players[A].teamSlot = 1;
    snapshot.gameState.players[C].teamSlot = 0;
    expect(withDraft(snapshot, (state) => activeTeamMembers(snapshot, state, 'TEAM_1'))).toEqual([C, A]);
  });

  it('normalizes every team to the seats 0 and 1 in the current seat order, joiners first on a tie', () => {
    const snapshot = lobby();
    for (const id of [A, B, C, D]) snapshot.gameState.players[id].teamSlot = 0; // a replayed room: everybody on seat 0
    withDraft(snapshot, (state) => {
      normalizeTeamSlots(snapshot, state);
      expect([A, C].map((id) => state.players[id].teamSlot)).toEqual([0, 1]);
      expect([B, D].map((id) => state.players[id].teamSlot)).toEqual([0, 1]);
    });
  });
});

describe('moving and swapping seats', () => {
  it('moving to the other team recolours the mover, clears a clashing mascot, resets only their Ready and voids their requests', () => {
    const snapshot = lobby();
    delete snapshot.members[D];
    delete snapshot.gameState.players[D]; // Team 2 seat 1 is free
    snapshot.gameState.boardState.seatSwapRequests = [
      { requesterPlayerId: C, targetPlayerId: A },
      { requesterPlayerId: A, targetPlayerId: B },
    ];
    withDraft(snapshot, (state) => {
      movePlayerToSeat(snapshot, state, A, 'TEAM_2', 1); // A (dog) sits next to B (dog)
      expect(state.players[A]).toMatchObject({ teamId: 'TEAM_2', teamSlot: 1, color: 'blue', characterId: null });
      expect(state.players[B].characterId).toBe('dog');
      expect(snapshot.members[A].ready).toBe(false);
      expect(snapshot.members[B].ready).toBe(true);
      expect(state.boardState.seatSwapRequests).toEqual([]);
    });
  });

  it('moving inside the team changes the seat only', () => {
    const snapshot = lobby();
    delete snapshot.members[C];
    delete snapshot.gameState.players[C];
    withDraft(snapshot, (state) => {
      movePlayerToSeat(snapshot, state, A, 'TEAM_1', 1);
      expect(state.players[A]).toMatchObject({ teamId: 'TEAM_1', teamSlot: 1, color: 'red', characterId: 'dog' });
      expect(snapshot.members[A].ready).toBe(true);
    });
  });

  it('swapping across teams exchanges team and seat, resets both Ready and voids both players\' requests', () => {
    const snapshot = lobby();
    snapshot.gameState.boardState.seatSwapRequests = [
      { requesterPlayerId: B, targetPlayerId: A },
      { requesterPlayerId: C, targetPlayerId: D },
    ];
    withDraft(snapshot, (state) => {
      swapPlayerSeats(snapshot, state, A, D);
      expect(state.players[A]).toMatchObject({ teamId: 'TEAM_2', teamSlot: 1, color: 'blue' });
      expect(state.players[D]).toMatchObject({ teamId: 'TEAM_1', teamSlot: 0, color: 'red' });
      expect([A, B, C, D].map((id) => snapshot.members[id].ready)).toEqual([false, true, true, false]);
      expect(state.boardState.seatSwapRequests).toEqual([]);
    });
  });

  it('swapping two teammates changes nothing but their seats', () => {
    const snapshot = lobby();
    withDraft(snapshot, (state) => {
      swapPlayerSeats(snapshot, state, A, C);
      expect([state.players[A].teamSlot, state.players[C].teamSlot]).toEqual([1, 0]);
      expect([A, B, C, D].every((id) => snapshot.members[id].ready)).toBe(true);
      expect(state.players[A].color).toBe('red');
    });
  });

  it('drops only the requests that involve the given players', () => {
    const snapshot = lobby();
    snapshot.gameState.boardState.seatSwapRequests = [
      { requesterPlayerId: A, targetPlayerId: B },
      { requesterPlayerId: C, targetPlayerId: D },
    ];
    withDraft(snapshot, (state) => {
      dropSeatSwapRequestsOf(state, [B]);
      expect(state.boardState.seatSwapRequests).toEqual([{ requesterPlayerId: C, targetPlayerId: D }]);
    });
  });
});

describe('what a 2v2 start still refuses', () => {
  it('names the player count and the team size, and passes a proper lobby', () => {
    const snapshot = lobby();
    withDraft(snapshot, (state) => {
      expect(getTeamStartBlockReason(snapshot, state)).toBeNull();
      state.players[B].teamId = 'TEAM_1'; // a 3 v 1 split cannot be seated, but the start rule is still defensive about it
      expect(getTeamStartBlockReason(snapshot, state)).toContain('2');
    });
  });
});
