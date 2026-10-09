import { describe, expect, it } from 'vitest';
import { REVIVE_WINDOW_SURVIVOR_TURNS, boardStateSchema, type PlayerId, type TeamId } from '@monopoly/shared';
import {
  ROOM_SNAPSHOT_SCHEMA_VERSION,
  assertRoomSnapshot,
  assertSupportedRoomSnapshot,
  chooseJoinTeam,
  createFreshPlayer,
  createRoomSnapshot,
  chooseJoinSeat,
  hydrateGameState,
  lobbySeatHolders,
  storeGameState,
  syncMembershipWithGameState,
  upgradeRoomSnapshotV8ToV9,
  upgradeRoomSnapshotV9ToV10,
  upgradeRoomSnapshotV10ToV11,
  type RoomSnapshot,
} from './rooms.js';
import { startTeamMatch } from './game/index.js';
import type { RoomRecord } from './persistence/types.js';
import { ConnectionRegistry } from './services/connectionRegistry.js';
import { projectPublicRoomState } from './services/publicState.js';

const P1 = '00000000-0000-4000-8000-000000000001'; // Team 1
const P2 = '00000000-0000-4000-8000-000000000002'; // Team 2
const P3 = '00000000-0000-4000-8000-000000000003'; // Team 1
const P4 = '00000000-0000-4000-8000-000000000004'; // Team 2
const TEAM: Record<PlayerId, TeamId> = { [P1]: 'TEAM_1', [P2]: 'TEAM_2', [P3]: 'TEAM_1', [P4]: 'TEAM_2' };
const MASCOT = { [P1]: 'dog', [P2]: 'cat', [P3]: 'panda', [P4]: 'duck' } as const;

/** A 2v2 room with four active members and a 2v2 game state; `started` seats them in their alternating slots. */
function snapshot2v2(started: boolean): RoomSnapshot {
  const snapshot = createRoomSnapshot();
  const { boardState } = snapshot.gameState;
  boardState.gameMode = 'TEAM_2V2';
  [P1, P2, P3, P4].forEach((playerId, index) => {
    snapshot.members[playerId] = { joinOrder: index + 1, ready: true, membershipStatus: 'ACTIVE' };
    snapshot.gameState.players[playerId] = createFreshPlayer(
      `Player ${index + 1}`,
      boardState.teams[TEAM[playerId]].color,
      MASCOT[playerId as keyof typeof MASCOT],
      TEAM[playerId],
      index >= 2 ? 1 : 0, // P1 and P2 take seat 0 of their teams, P3 and P4 seat 1
    );
  });
  snapshot.nextJoinOrder = 5;
  boardState.players = [P1, P2, P3, P4];
  if (started) {
    const state = hydrateGameState(snapshot, 'LOBBY');
    state.boardState.gameStarted = true;
    startTeamMatch(state, P1, { TEAM_1: [P1, P3], TEAM_2: [P2, P4] });
    state.boardState.currentPlayer = { id: P1, hasMoved: false };
    state.boardState.turnNumber = 3;
    storeGameState(snapshot, state, 'IN_PROGRESS');
  }
  return snapshot;
}

function room(snapshot: RoomSnapshot, status: RoomRecord['status']): RoomRecord<RoomSnapshot> {
  return {
    id: '00000000-0000-4000-8000-0000000000aa',
    code: 'TEAMS',
    status,
    hostPlayerId: P1,
    aggregateVersion: 1,
    snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
    gameSnapshot: snapshot,
    nextActionAt: null,
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: new Date('2030-01-01T00:00:00.000Z'),
    lastActivityAt: new Date('2030-01-01T00:00:00.000Z'),
    expiresAt: null,
  };
}

/** Eliminates `playerId` by bankruptcy the way the domain does, then syncs the room membership. */
function bankrupt(snapshot: RoomSnapshot, playerId: PlayerId): void {
  const state = hydrateGameState(snapshot, 'IN_PROGRESS');
  state.boardState.currentPlayer = { id: P2, hasMoved: true };
  const finished = {
    name: state.players[playerId].name,
    color: state.players[playerId].color,
    characterId: state.players[playerId].characterId,
    teamId: state.players[playerId].teamId,
    reason: 'BANKRUPT' as const,
    accountBalance: 0,
  };
  state.boardState.finishedPlayers[playerId] = finished;
  delete state.players[playerId];
  state.boardState.players = state.boardState.teamPlay.slotOrder.filter((id) => state.players[id]);
  state.boardState.teamPlay.reviveWindows.push({
    playerId, teamId: finished.teamId, turnsRemaining: 3, openedAtTurnNumber: 2,
  });
  storeGameState(snapshot, state, 'IN_PROGRESS');
  syncMembershipWithGameState(snapshot);
}

describe('snapshot schema v11', () => {
  it('is the current durable version and a fresh room is a Solo room with default teams', () => {
    expect(ROOM_SNAPSHOT_SCHEMA_VERSION).toBe(11);
    const { boardState } = createRoomSnapshot().gameState;
    expect(boardState.gameMode).toBe('SOLO');
    expect(boardState.teams).toEqual({
      TEAM_1: { name: 'Team 1', color: 'red' },
      TEAM_2: { name: 'Team 2', color: 'blue' },
    });
    expect(boardState.teamPlay).toEqual({ slotOrder: [], revivedPlayerIds: [], reviveWindows: [] });
    expect(boardState.winningTeamId).toBeNull();
    expect(boardState.seatSwapRequests).toEqual([]);
    expect(() => assertRoomSnapshot(createRoomSnapshot())).not.toThrow();
  });

  it('round-trips a 2v2 lobby, a started 2v2 game and a game with an open revive window through JSON', () => {
    const lobby = snapshot2v2(false);
    expect(() => assertRoomSnapshot(lobby)).not.toThrow();
    expect(() => assertRoomSnapshot(JSON.parse(JSON.stringify(lobby)) as RoomSnapshot)).not.toThrow();

    const started = snapshot2v2(true);
    expect(() => assertRoomSnapshot(started)).not.toThrow();
    expect(started.gameState.boardState.players).toEqual([P1, P2, P3, P4]);
    expect(started.gameState.boardState.teamPlay.slotOrder).toEqual([P1, P2, P3, P4]);

    bankrupt(started, P3);
    expect(() => assertRoomSnapshot(JSON.parse(JSON.stringify(started)) as RoomSnapshot)).not.toThrow();
    expect(started.members[P3].membershipStatus).toBe('FINISHED');
    expect(boardStateSchema.safeParse(started.gameState.boardState).success).toBe(true);
  });

  it('accepts the supported-snapshot gate with the room lifecycle for a started 2v2 game', () => {
    expect(() => assertSupportedRoomSnapshot({
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION, gameSnapshot: snapshot2v2(true), hostPlayerId: P1, status: 'IN_PROGRESS',
    })).not.toThrow();
    expect(() => assertSupportedRoomSnapshot({
      snapshotSchemaVersion: 9, gameSnapshot: snapshot2v2(true), hostPlayerId: P1, status: 'IN_PROGRESS',
    })).toThrow(/Unsupported room snapshot schema version 9/);
  });

  it('puts a revived member back into the active room membership', () => {
    const snapshot = snapshot2v2(true);
    bankrupt(snapshot, P3);
    expect(snapshot.members[P3].membershipStatus).toBe('FINISHED');
    const state = hydrateGameState(snapshot, 'IN_PROGRESS');
    state.players[P3] = createFreshPlayer('Player 3', 'red', 'panda', 'TEAM_1');
    delete state.boardState.finishedPlayers[P3];
    state.boardState.teamPlay.reviveWindows = [];
    state.boardState.teamPlay.revivedPlayerIds = [P3];
    state.boardState.players = state.boardState.teamPlay.slotOrder.filter((id) => state.players[id]);
    storeGameState(snapshot, state, 'IN_PROGRESS');
    syncMembershipWithGameState(snapshot);
    expect(snapshot.members[P3].membershipStatus).toBe('ACTIVE');
    expect(() => assertRoomSnapshot(snapshot)).not.toThrow();
  });
});

describe('corrupt team state is rejected', () => {
  const mutate = (started: boolean, change: (snapshot: RoomSnapshot) => void): (() => void) => () => {
    const snapshot = snapshot2v2(started);
    change(snapshot);
    assertRoomSnapshot(snapshot);
  };

  it('rejects a player who does not wear their team colour', () => {
    expect(mutate(false, (s) => { s.gameState.players[P1].color = 'green'; })).toThrow(/team colour/);
    expect(mutate(true, (s) => { s.gameState.players[P2].color = 'red'; })).toThrow(/team colour/);
  });

  it('rejects two teams that share a colour', () => {
    expect(mutate(false, (s) => { s.gameState.boardState.teams.TEAM_2.color = 'red'; })).toThrow();
  });

  it('rejects match-level team state in a Solo game or in a lobby', () => {
    expect(mutate(false, (s) => { s.gameState.boardState.gameMode = 'SOLO'; s.gameState.boardState.teamPlay.slotOrder = [P1, P2, P3, P4]; }))
      .toThrow(/Solo/);
    expect(mutate(false, (s) => { s.gameState.boardState.teamPlay.revivedPlayerIds = [P1]; })).toThrow(/lobby/);
    expect(mutate(false, (s) => { s.gameState.boardState.gameMode = 'SOLO'; s.gameState.boardState.winningTeamId = 'TEAM_1'; }))
      .toThrow(/Solo/);
  });

  it('rejects slots that are incomplete, do not alternate, or do not match the live turn order', () => {
    expect(mutate(true, (s) => { s.gameState.boardState.teamPlay.slotOrder = [P1, P2, P3]; })).toThrow();
    expect(mutate(true, (s) => { s.gameState.boardState.teamPlay.slotOrder = [P1, P3, P2, P4]; })).toThrow(/alternate/);
    expect(mutate(true, (s) => { s.gameState.boardState.players = [P1, P3, P2, P4]; })).toThrow(/turn order/);
    expect(mutate(true, (s) => { s.gameState.boardState.players = [P1, P2, P3]; })).toThrow(); // generic member/turn-order check
  });

  it('rejects revive windows that disagree with the players', () => {
    // A window for a player who is still in the game.
    expect(mutate(true, (s) => {
      s.gameState.boardState.teamPlay.reviveWindows = [{ playerId: P3, teamId: 'TEAM_1', turnsRemaining: 3, openedAtTurnNumber: 1 }];
    })).toThrow(/revive window/);
    // A window with no surviving teammate.
    expect(() => {
      const snapshot = snapshot2v2(true);
      bankrupt(snapshot, P3);
      const state = hydrateGameState(snapshot, 'IN_PROGRESS');
      state.boardState.finishedPlayers[P1] = {
        name: 'x', color: 'red', characterId: 'dog', teamId: 'TEAM_1', reason: 'BANKRUPT', accountBalance: 0,
      };
      delete state.players[P1];
      state.boardState.players = [P2, P4];
      storeGameState(snapshot, state, 'IN_PROGRESS');
      syncMembershipWithGameState(snapshot);
      assertRoomSnapshot(snapshot);
    }).toThrow();
    // A window for a player who has already been revived once.
    expect(() => {
      const snapshot = snapshot2v2(true);
      bankrupt(snapshot, P3);
      snapshot.gameState.boardState.teamPlay.revivedPlayerIds = [P3];
      assertRoomSnapshot(snapshot);
    }).toThrow();
    // Two windows for one team.
    expect(() => {
      const snapshot = snapshot2v2(true);
      snapshot.gameState.boardState.teamPlay.reviveWindows = [
        { playerId: P1, teamId: 'TEAM_1', turnsRemaining: 3, openedAtTurnNumber: 1 },
        { playerId: P3, teamId: 'TEAM_1', turnsRemaining: 3, openedAtTurnNumber: 1 },
      ];
      assertRoomSnapshot(snapshot);
    }).toThrow();
    // More than the five turns of a window.
    expect(() => {
      const snapshot = snapshot2v2(true);
      bankrupt(snapshot, P3);
      snapshot.gameState.boardState.teamPlay.reviveWindows[0].turnsRemaining = REVIVE_WINDOW_SURVIVOR_TURNS + 1;
      assertRoomSnapshot(snapshot);
    }).toThrow();
  });

  it('rejects a revived player or a slot that no player of the game owns', () => {
    expect(mutate(true, (s) => { s.gameState.boardState.teamPlay.revivedPlayerIds = ['00000000-0000-4000-8000-0000000000ff']; }))
      .toThrow();
  });

  it('rejects a team winner without a winner, or a winner whose team did not win', () => {
    expect(mutate(true, (s) => { s.gameState.boardState.winningTeamId = 'TEAM_1'; })).toThrow(/winner/);
    expect(() => {
      const snapshot = snapshot2v2(true);
      const state = hydrateGameState(snapshot, 'IN_PROGRESS');
      state.boardState.winner = { playerId: P1, name: 'Player 1', color: 'red', characterId: 'dog', teamId: 'TEAM_1' };
      state.boardState.winningTeamId = 'TEAM_1';
      storeGameState(snapshot, state, 'FINISHED');
      assertRoomSnapshot(snapshot); // Team 2 still has active players: not a valid win
    }).toThrow(/team winner/);
  });

  it('accepts a team winner when the other team has no active player left', () => {
    const snapshot = snapshot2v2(true);
    const state = hydrateGameState(snapshot, 'IN_PROGRESS');
    for (const playerId of [P2, P4]) {
      state.boardState.finishedPlayers[playerId] = {
        name: state.players[playerId].name, color: 'blue', characterId: state.players[playerId].characterId,
        teamId: 'TEAM_2', reason: 'BANKRUPT', accountBalance: 0,
      };
      delete state.players[playerId];
    }
    state.boardState.players = [P1, P3];
    state.boardState.winner = { playerId: P1, name: 'Player 1', color: 'red', characterId: 'dog', teamId: 'TEAM_1' };
    state.boardState.winningTeamId = 'TEAM_1';
    storeGameState(snapshot, state, 'FINISHED');
    syncMembershipWithGameState(snapshot);
    expect(() => assertRoomSnapshot(snapshot)).not.toThrow();
  });

  it('rejects an emergency rescue offer that does not match the queue', () => {
    const base = (): RoomSnapshot => {
      const snapshot = snapshot2v2(true);
      const state = hydrateGameState(snapshot, 'IN_PROGRESS');
      state.players[P2].accountBalance = 0;
      state.players[P4].accountBalance = 500;
      state.boardState.currentPlayer = { id: P2, hasMoved: true };
      state.boardState.paymentQueue = {
        operationId: '00000000-0000-4000-8000-0000000000b1',
        orderedClaims: [{
          claimId: '00000000-0000-4000-8000-0000000000b2',
          debtorPlayerId: P2,
          creditor: 'PLAYER',
          creditorPlayerId: P1,
          amount: 200,
          remainingAmount: 200,
          source: { kind: 'OTHER', description: 'rescue test' },
          status: 'PENDING',
        }],
        activeClaimIndex: 0,
        continuation: { playerId: P2, turnNumber: 3 },
        actionDeadlineAt: '2030-01-01T00:00:30.000Z',
        rescue: {
          rescueId: '00000000-0000-4000-8000-0000000000b3',
          debtorPlayerId: P2,
          rescuerPlayerId: P4,
          amount: 200,
          expiresAt: '2030-01-01T00:00:30.000Z',
        },
      };
      storeGameState(snapshot, state, 'IN_PROGRESS');
      return snapshot;
    };
    expect(() => assertRoomSnapshot(base())).not.toThrow();

    const wrongAmount = base();
    wrongAmount.gameState.boardState.paymentQueue!.rescue!.amount = 150;
    expect(() => assertRoomSnapshot(wrongAmount)).toThrow(/rescue/);

    const poorRescuer = base();
    poorRescuer.gameState.players[P4].accountBalance = 199;
    expect(() => assertRoomSnapshot(poorRescuer)).toThrow(/rescue/);

    const notTeammate = base();
    notTeammate.gameState.boardState.paymentQueue!.rescue!.rescuerPlayerId = P3;
    expect(() => assertRoomSnapshot(notTeammate)).toThrow(/rescue/);

    const stillOwns = base();
    stillOwns.gameState.boardState.ownedProps[1] = { id: P2, color: 'blue', houses: 0 };
    expect(() => assertRoomSnapshot(stillOwns)).toThrow(/rescue/);

    const wrongDeadline = base();
    wrongDeadline.gameState.boardState.paymentQueue!.actionDeadlineAt = '2030-01-01T00:02:00.000Z';
    expect(() => assertRoomSnapshot(wrongDeadline)).toThrow();

    const solo = base();
    solo.gameState.boardState.gameMode = 'SOLO';
    solo.gameState.boardState.teamPlay = { slotOrder: [], revivedPlayerIds: [], reviveWindows: [] };
    expect(() => assertRoomSnapshot(solo)).toThrow(/Solo/);
  });

  it('allows a teammate to be the lander of a pending development decision on a teammate street, and nobody else', () => {
    const snapshot = snapshot2v2(true);
    const state = hydrateGameState(snapshot, 'IN_PROGRESS');
    state.boardState.ownedProps[1] = { id: P1, color: 'red', houses: 1 };
    state.boardState.currentPlayer = { id: P3, hasMoved: true };
    state.players[P3].currentTile = 1;
    state.turnInfo.pendingDevelopmentDecision = {
      operationId: '00000000-0000-4000-8000-0000000000c1',
      playerId: P3,
      turnNumber: 3,
      tileID: 1,
      levelAtLanding: 1,
      kind: 'HOUSES',
      continuation: { playerId: P3, turnNumber: 3 },
    };
    storeGameState(snapshot, state, 'IN_PROGRESS');
    expect(() => assertRoomSnapshot(snapshot)).not.toThrow();

    // The same decision by an opponent of the owner is a corrupt snapshot.
    const opponent = hydrateGameState(snapshot, 'IN_PROGRESS');
    opponent.boardState.currentPlayer = { id: P2, hasMoved: true };
    opponent.players[P2].currentTile = 1;
    opponent.turnInfo.pendingDevelopmentDecision = {
      ...state.turnInfo.pendingDevelopmentDecision,
      playerId: P2,
      continuation: { playerId: P2, turnNumber: 3 },
    };
    storeGameState(snapshot, opponent, 'IN_PROGRESS');
    expect(() => assertRoomSnapshot(snapshot)).toThrow(/development/);
  });
});

describe('V8 to V9 upgrade', () => {
  const V8_P1 = '00000000-0000-4000-8000-0000000000a1';
  const V8_P2 = '00000000-0000-4000-8000-0000000000a2';
  const V8_P3 = '00000000-0000-4000-8000-0000000000a3';

  const v8Envelope = () => {
    const snapshot = createRoomSnapshot();
    snapshot.members = {
      [V8_P1]: { joinOrder: 2, ready: true, membershipStatus: 'ACTIVE' },
      [V8_P2]: { joinOrder: 5, ready: true, membershipStatus: 'FINISHED' },
      [V8_P3]: { joinOrder: 9, ready: true, membershipStatus: 'ACTIVE' },
    };
    snapshot.nextJoinOrder = 10;
    snapshot.gameState.players = {
      [V8_P1]: createFreshPlayer('One', 'red', 'dog'),
      [V8_P3]: createFreshPlayer('Three', 'blue', 'cat'),
    };
    snapshot.gameState.boardState.finishedPlayers = {
      [V8_P2]: { name: 'Two', color: 'green', characterId: 'panda', teamId: 'TEAM_1', reason: 'BANKRUPT', accountBalance: 0 },
    };
    snapshot.gameState.boardState.players = [V8_P1, V8_P3];
    snapshot.gameState.boardState.gameStarted = true;
    snapshot.gameState.boardState.currentPlayer = { id: V8_P1, hasMoved: false };
    snapshot.gameState.boardState.turnNumber = 4;
    snapshot.gameState.boardState.paymentQueue = {
      operationId: '00000000-0000-4000-8000-0000000000d1',
      orderedClaims: [{
        claimId: '00000000-0000-4000-8000-0000000000d2',
        debtorPlayerId: V8_P1,
        creditor: 'BANK',
        amount: 50,
        remainingAmount: 50,
        source: { kind: 'OTHER', description: 'v8' },
        status: 'PENDING',
      }],
      activeClaimIndex: 0,
      continuation: { playerId: V8_P1, turnNumber: 4 },
      actionDeadlineAt: '2030-01-01T00:02:00.000Z',
      rescue: null,
    };
    // Strip every v9 field to make a genuine V8 document.
    const json = JSON.parse(JSON.stringify(snapshot)) as {
      gameState: {
        players: Record<string, Record<string, unknown>>;
        boardState: Record<string, unknown> & {
          finishedPlayers: Record<string, Record<string, unknown>>;
          paymentQueue: Record<string, unknown>;
        };
      };
    };
    Object.values(json.gameState.players).forEach((player) => { delete player.teamId; });
    Object.values(json.gameState.boardState.finishedPlayers).forEach((player) => { delete player.teamId; });
    Object.values(json.gameState.players).forEach((player) => { delete player.teamSlot; });
    for (const key of ['gameMode', 'teams', 'teamPlay', 'winningTeamId', 'seatSwapRequests']) delete json.gameState.boardState[key];
    delete json.gameState.boardState.paymentQueue.rescue;
    return { snapshotSchemaVersion: 8, gameSnapshot: json, hostPlayerId: V8_P1, status: 'IN_PROGRESS' as const };
  };

  it('turns a V8 room into a Solo V9 room that passes every invariant, without mutating the input', () => {
    const legacy = v8Envelope();
    const before = JSON.stringify(legacy);
    const upgraded = upgradeRoomSnapshotV8ToV9(legacy);

    expect(JSON.stringify(legacy)).toBe(before);
    expect(upgraded.snapshotSchemaVersion).toBe(9);
    const { boardState, players } = upgraded.gameSnapshot.gameState;
    expect(boardState.gameMode).toBe('SOLO');
    expect(boardState.teams).toEqual({
      TEAM_1: { name: 'Team 1', color: 'red' },
      TEAM_2: { name: 'Team 2', color: 'blue' },
    });
    expect(boardState.teamPlay).toEqual({ slotOrder: [], revivedPlayerIds: [], reviveWindows: [] });
    expect(boardState.winningTeamId).toBeNull();
    expect(boardState.paymentQueue?.rescue).toBeNull();
    // Teams alternate through every member in join order: 2 -> Team 1, 5 -> Team 2, 9 -> Team 1.
    expect(players[V8_P1].teamId).toBe('TEAM_1');
    expect(boardState.finishedPlayers[V8_P2].teamId).toBe('TEAM_2');
    expect(players[V8_P3].teamId).toBe('TEAM_1');
    expect(players[V8_P1]).toMatchObject({ name: 'One', color: 'red', accountBalance: 1500 });
    // V9 is no longer the current version; the full chain passes every invariant.
    expect(() => assertSupportedRoomSnapshot(upgraded)).toThrow(/Unsupported room snapshot schema version 9/);
    expect(() => assertSupportedRoomSnapshot(upgradeRoomSnapshotV10ToV11(upgradeRoomSnapshotV9ToV10(upgraded)))).not.toThrow();
  });

  it('upgrades a decided game too: the winner receives a team and no team winner is invented', () => {
    const legacy = v8Envelope();
    const json = legacy.gameSnapshot as unknown as {
      gameState: { boardState: Record<string, unknown> };
    };
    json.gameState.boardState.winner = { playerId: V8_P1, name: 'One', color: 'red', characterId: 'dog' };
    json.gameState.boardState.paymentQueue = null;
    const upgraded = upgradeRoomSnapshotV8ToV9({ ...legacy, status: 'FINISHED' });
    expect(upgraded.gameSnapshot.gameState.boardState.winner).toMatchObject({ playerId: V8_P1, teamId: 'TEAM_1' });
    expect(upgraded.gameSnapshot.gameState.boardState.winningTeamId).toBeNull();
  });

  it('refuses anything but a V8 snapshot', () => {
    expect(() => upgradeRoomSnapshotV8ToV9({ ...v8Envelope(), snapshotSchemaVersion: 7 })).toThrow(/Only V8/);
    expect(() => upgradeRoomSnapshotV8ToV9({ ...v8Envelope(), snapshotSchemaVersion: 9 })).toThrow(/Only V8/);
  });
});

describe('V9 to V10 upgrade', () => {
  const A = '00000000-0000-4000-8000-0000000000b1';
  const B = '00000000-0000-4000-8000-0000000000b2';
  const C = '00000000-0000-4000-8000-0000000000b3';
  const D = '00000000-0000-4000-8000-0000000000b4';

  const v9Lobby = () => {
    const snapshot = createRoomSnapshot();
    // Join order scrambled against the map order, so the slot assignment must follow the join order.
    snapshot.members = {
      [D]: { joinOrder: 8, ready: false, membershipStatus: 'ACTIVE' },
      [C]: { joinOrder: 6, ready: true, membershipStatus: 'ACTIVE' },
      [B]: { joinOrder: 4, ready: false, membershipStatus: 'ACTIVE' },
      [A]: { joinOrder: 2, ready: true, membershipStatus: 'ACTIVE' },
    };
    snapshot.nextJoinOrder = 9;
    const team: Record<string, TeamId> = { [A]: 'TEAM_1', [B]: 'TEAM_2', [C]: 'TEAM_1', [D]: 'TEAM_2' };
    for (const id of [D, C, B, A]) {
      snapshot.gameState.players[id] = createFreshPlayer(`P ${id.slice(-1)}`, 'red', null, team[id]);
    }
    snapshot.gameState.boardState.players = [A, B, C, D];
    const json = JSON.parse(JSON.stringify(snapshot)) as {
      gameState: { players: Record<string, Record<string, unknown>>; boardState: Record<string, unknown> };
    };
    Object.values(json.gameState.players).forEach((player) => { delete player.teamSlot; });
    delete json.gameState.boardState.seatSwapRequests;
    return { snapshotSchemaVersion: 9, gameSnapshot: json, hostPlayerId: A, status: 'LOBBY' as const };
  };

  it('gives every live player the next free seat of their team in join order and starts with no request', () => {
    const legacy = v9Lobby();
    const before = JSON.stringify(legacy);
    const upgraded = upgradeRoomSnapshotV9ToV10(legacy);

    expect(JSON.stringify(legacy)).toBe(before);
    expect(upgraded.snapshotSchemaVersion).toBe(10);
    const { players, boardState } = upgraded.gameSnapshot.gameState;
    expect(boardState.seatSwapRequests).toEqual([]);
    expect([A, C].map((id) => players[id].teamSlot)).toEqual([0, 1]); // Team 1 in join order 2, 6
    expect([B, D].map((id) => players[id].teamSlot)).toEqual([0, 1]); // Team 2 in join order 4, 8
    expect(() => assertSupportedRoomSnapshot(upgradeRoomSnapshotV10ToV11(upgraded))).not.toThrow();
  });

  it('never assigns a seat above 1, even for a legacy team with more than two players', () => {
    const legacy = v9Lobby();
    const players = (legacy.gameSnapshot as unknown as { gameState: { players: Record<string, Record<string, unknown>> } })
      .gameState.players;
    players[B].teamId = 'TEAM_1';
    players[D].teamId = 'TEAM_1';
    const upgraded = upgradeRoomSnapshotV9ToV10(legacy);
    expect(Object.values(upgraded.gameSnapshot.gameState.players).every((player) => player.teamSlot <= 1)).toBe(true);
  });

  it('refuses anything but a V9 snapshot', () => {
    expect(() => upgradeRoomSnapshotV9ToV10({ ...v9Lobby(), snapshotSchemaVersion: 8 })).toThrow(/Only V9/);
    expect(() => upgradeRoomSnapshotV9ToV10({ ...v9Lobby(), snapshotSchemaVersion: 10 })).toThrow(/Only V9/);
  });
});

describe('lobby seats', () => {
  const mutate = (change: (snapshot: RoomSnapshot) => void): (() => void) => () => {
    const snapshot = snapshot2v2(false);
    change(snapshot);
    assertRoomSnapshot(snapshot);
  };

  it('accepts a 2v2 lobby with open requests between its members', () => {
    const snapshot = snapshot2v2(false);
    snapshot.gameState.boardState.seatSwapRequests = [
      { requesterPlayerId: P1, targetPlayerId: P2 },
      { requesterPlayerId: P3, targetPlayerId: P4 },
    ];
    expect(() => assertRoomSnapshot(snapshot)).not.toThrow();
    expect(() => assertRoomSnapshot(JSON.parse(JSON.stringify(snapshot)) as RoomSnapshot)).not.toThrow();
  });

  it('rejects two lobby members on one seat, in either mode', () => {
    expect(mutate((s) => { s.gameState.players[P3].teamSlot = 0; })).toThrow(/seats/);
    expect(mutate((s) => { s.gameState.boardState.gameMode = 'SOLO'; s.gameState.players[P3].teamSlot = 0; })).toThrow(/seats/);
  });

  it('rejects requests that are not between two different lobby members, or repeat a requester', () => {
    expect(mutate((s) => { s.gameState.boardState.seatSwapRequests = [{ requesterPlayerId: P1, targetPlayerId: P1 }]; })).toThrow();
    expect(mutate((s) => { s.gameState.boardState.seatSwapRequests = [{ requesterPlayerId: P1, targetPlayerId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }]; }))
      .toThrow(/unknown player/);
    expect(mutate((s) => {
      s.gameState.boardState.seatSwapRequests = [
        { requesterPlayerId: P1, targetPlayerId: P2 },
        { requesterPlayerId: P1, targetPlayerId: P4 },
      ];
    })).toThrow(/seat-swap/);
  });

  it('rejects any request outside a 2v2 lobby', () => {
    expect(mutate((s) => { s.gameState.boardState.gameMode = 'SOLO'; s.gameState.boardState.seatSwapRequests = [{ requesterPlayerId: P1, targetPlayerId: P2 }]; }))
      .toThrow(/outside a 2v2 lobby/);
    const started = snapshot2v2(true);
    started.gameState.boardState.seatSwapRequests = [{ requesterPlayerId: P1, targetPlayerId: P2 }];
    expect(() => assertRoomSnapshot(started)).toThrow(/outside a 2v2 lobby/);
  });

  it('lets a started game reuse seat numbers: seats only matter in the lobby', () => {
    const started = snapshot2v2(true);
    started.gameState.players[P3].teamSlot = 0;
    expect(() => assertRoomSnapshot(started)).not.toThrow();
  });

  it('seats a joiner in the smaller team on its lowest empty seat and refuses a full lobby', () => {
    const snapshot = createRoomSnapshot();
    const seats: Array<[TeamId, number]> = [];
    for (let index = 1; index <= 4; index += 1) {
      const id = `00000000-0000-4000-8000-00000000020${index}`;
      const seat = chooseJoinSeat(snapshot);
      if (!seat) throw new Error('expected a seat');
      seats.push([seat.teamId, seat.teamSlot]);
      snapshot.members[id] = { joinOrder: index, ready: false, membershipStatus: 'ACTIVE' };
      snapshot.gameState.players[id] = createFreshPlayer(`P${index}`, 'red', null, seat.teamId, seat.teamSlot);
    }
    expect(seats).toEqual([['TEAM_1', 0], ['TEAM_2', 0], ['TEAM_1', 1], ['TEAM_2', 1]]);
    expect(chooseJoinSeat(snapshot)).toBeNull();

    // The first player leaves: the next joiner takes exactly the seat that became free.
    delete snapshot.members['00000000-0000-4000-8000-000000000201'];
    delete snapshot.gameState.players['00000000-0000-4000-8000-000000000201'];
    expect(chooseJoinSeat(snapshot)).toEqual({ teamId: 'TEAM_1', teamSlot: 0 });
    expect(lobbySeatHolders(snapshot).map((holder) => [holder.teamId, holder.teamSlot])).toEqual([
      ['TEAM_2', 0], ['TEAM_1', 1], ['TEAM_2', 1],
    ]);
  });
});

describe('joining balances the teams', () => {
  it('places four joiners Team 1, Team 2, Team 1, Team 2 and the next into the smaller team', () => {
    const snapshot = createRoomSnapshot();
    const placed: TeamId[] = [];
    for (let index = 1; index <= 4; index += 1) {
      const id = `00000000-0000-4000-8000-00000000010${index}`;
      const teamId = chooseJoinTeam(snapshot);
      placed.push(teamId);
      snapshot.members[id] = { joinOrder: index, ready: false, membershipStatus: 'ACTIVE' };
      snapshot.gameState.players[id] = createFreshPlayer(`P${index}`, 'red', null, teamId);
    }
    expect(placed).toEqual(['TEAM_1', 'TEAM_2', 'TEAM_1', 'TEAM_2']);

    // One member leaves: the next joiner goes to the team that is now smaller.
    delete snapshot.members['00000000-0000-4000-8000-000000000102'];
    delete snapshot.gameState.players['00000000-0000-4000-8000-000000000102'];
    expect(chooseJoinTeam(snapshot)).toBe('TEAM_2');
  });
});

describe('public projection of team state', () => {
  it('exposes the mode, both teams with their members, revive windows with the survivor, and each player\'s team', () => {
    const snapshot = snapshot2v2(true);
    bankrupt(snapshot, P3);
    const projected = projectPublicRoomState(room(snapshot, 'IN_PROGRESS'), new ConnectionRegistry());
    const board = projected.gameState.boardState;

    expect(projected.protocolVersion).toBe(13);
    expect(board.gameMode).toBe('TEAM_2V2');
    expect(board.winningTeamId).toBeNull();
    expect(board.teams).toEqual([
      { teamId: 'TEAM_1', name: 'Team 1', color: 'red', memberPlayerIds: [P1, P3] },
      { teamId: 'TEAM_2', name: 'Team 2', color: 'blue', memberPlayerIds: [P2, P4] },
    ]);
    expect(board.teamPlay).toEqual({
      revivedPlayerIds: [],
      reviveWindows: [{ playerId: P3, teamId: 'TEAM_1', survivorPlayerId: P1, turnsRemaining: 3, openedAtTurnNumber: 2 }],
    });
    expect(projected.players.map((player) => [player.playerId, player.teamId])).toEqual([
      [P1, 'TEAM_1'], [P2, 'TEAM_2'], [P3, 'TEAM_1'], [P4, 'TEAM_2'],
    ]);
    // The bankrupt player (P3) is no longer in the game, so they report seat 0.
    expect(projected.players.map((player) => player.teamSlot)).toEqual([0, 0, 0, 1]);
    expect(board.seatSwapRequests).toEqual([]);
    expect(projected.gameState.players[P1].teamId).toBe('TEAM_1');
    expect(board.finishedPlayers[P3]).toMatchObject({ teamId: 'TEAM_1', reason: 'BANKRUPT' });
    // Nothing match-private leaks: the slot order is not part of the public contract.
    expect(JSON.stringify(projected)).not.toContain('slotOrder');
  });

  it('exposes an open rescue offer on the payment shortfall, and nothing in Solo', () => {
    const snapshot = snapshot2v2(true);
    const state = hydrateGameState(snapshot, 'IN_PROGRESS');
    state.players[P2].accountBalance = 0;
    state.boardState.currentPlayer = { id: P2, hasMoved: true };
    state.boardState.paymentQueue = {
      operationId: '00000000-0000-4000-8000-0000000000e1',
      orderedClaims: [{
        claimId: '00000000-0000-4000-8000-0000000000e2',
        debtorPlayerId: P2, creditor: 'BANK', amount: 100, remainingAmount: 100,
        source: { kind: 'OTHER', description: 'x' }, status: 'PENDING',
      }],
      activeClaimIndex: 0,
      continuation: { playerId: P2, turnNumber: 3 },
      actionDeadlineAt: '2030-01-01T00:00:30.000Z',
      rescue: {
        rescueId: '00000000-0000-4000-8000-0000000000e3',
        debtorPlayerId: P2,
        rescuerPlayerId: P4,
        amount: 100,
        expiresAt: '2030-01-01T00:00:30.000Z',
      },
    };
    storeGameState(snapshot, state, 'IN_PROGRESS');
    const projected = projectPublicRoomState(room(snapshot, 'IN_PROGRESS'), new ConnectionRegistry());
    expect(projected.gameState.boardState.paymentShortfall?.rescue).toEqual({
      rescueId: '00000000-0000-4000-8000-0000000000e3',
      debtorPlayerId: P2,
      rescuerPlayerId: P4,
      amount: 100,
      expiresAt: '2030-01-01T00:00:30.000Z',
    });
  });
});
