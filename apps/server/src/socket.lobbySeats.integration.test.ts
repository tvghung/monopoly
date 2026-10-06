import { randomUUID } from 'node:crypto';

import type { RemovedFromRoomInfo, ResumeSessionResult } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';

import type { RoomRecord } from './persistence/types.js';
import type { RoomSnapshot } from './rooms.js';
import {
  ack,
  appearance,
  cancelSeatSwap,
  connect,
  failureOf,
  join,
  kick,
  leave,
  lobbyOfFour,
  moveToSeat,
  okOf,
  playAgain,
  readyEveryone,
  ready,
  requestSeatSwap,
  respondSeatSwap,
  resume,
  setMode,
  start,
  stored,
  swapSeats,
  useHarnessCleanup,
} from './testing/teamHarness.js';

useHarnessCleanup();

type StoredRoom = RoomRecord<RoomSnapshot>;

const seatOf = (room: StoredRoom, playerId: string): [string, number] => {
  const player = room.gameSnapshot.gameState.players[playerId];
  return [player.teamId, player.teamSlot];
};
const requestsOf = (room: StoredRoom) => room.gameSnapshot.gameState.boardState.seatSwapRequests;
const isReady = (room: StoredRoom, playerId: string): boolean => room.gameSnapshot.members[playerId].ready;

/** A 2v2 lobby of four. Seats: Harvey T1/0, Nora T2/0, Alex T1/1, Zed T2/1; mascots dog, dog, cat, panda; everybody Ready. */
async function readyTeamLobby() {
  const lobby = await lobbyOfFour();
  okOf(await setMode(lobby.players[0].socket, 'TEAM_2V2'));
  await readyEveryone(lobby.players);
  return lobby;
}

describe('2v2 lobby seats', () => {
  it('seats the four joiners on their own seats and projects them with no open request', async () => {
    const { players, persistence, roomId } = await lobbyOfFour();
    const room = await stored(persistence, roomId);
    expect(players.map((player) => seatOf(room, player.playerId))).toEqual([
      ['TEAM_1', 0], ['TEAM_2', 0], ['TEAM_1', 1], ['TEAM_2', 1],
    ]);
    expect(players[3].room.players.map((player) => player.teamSlot)).toEqual([0, 0, 1, 1]);
    expect(players[3].room.gameState.boardState.seatSwapRequests).toEqual([]);
  });

  it('moves a player to an empty seat of the other team at once: new colour, clashing mascot cleared, only their Ready reset', async () => {
    const { players, persistence, roomId } = await readyTeamLobby();
    const [harvey, nora, alex, zed] = players;
    okOf(await leave(zed.socket)); // Team 2 seat 1 is empty now

    okOf(await moveToSeat(harvey.socket, 'TEAM_2', 1)); // Harvey (dog) joins Nora (dog)
    const room = await stored(persistence, roomId);
    expect(seatOf(room, harvey.playerId)).toEqual(['TEAM_2', 1]);
    expect(room.gameSnapshot.gameState.players[harvey.playerId]).toMatchObject({ color: 'blue', characterId: null });
    expect(room.gameSnapshot.gameState.players[nora.playerId].characterId).toBe('dog'); // the player who stayed keeps it
    expect(isReady(room, harvey.playerId)).toBe(false);
    expect(isReady(room, nora.playerId)).toBe(true);
    expect(isReady(room, alex.playerId)).toBe(true);
    expect(requestsOf(room)).toEqual([]);
  });

  it('moves a player to the empty seat of their own team without touching colour, mascot or Ready', async () => {
    const { players, persistence, roomId } = await readyTeamLobby();
    const [harvey, , alex] = players;
    okOf(await leave(harvey.socket)); // Team 1 seat 0 is empty; Alex (seat 1) is the only Team 1 member left

    okOf(await moveToSeat(alex.socket, 'TEAM_1', 0));
    const room = await stored(persistence, roomId);
    expect(seatOf(room, alex.playerId)).toEqual(['TEAM_1', 0]);
    expect(room.gameSnapshot.gameState.players[alex.playerId]).toMatchObject({ color: 'red', characterId: 'cat' });
    expect(isReady(room, alex.playerId)).toBe(true);
  });

  it('refuses an occupied seat, the seat the player already holds, Solo mode and a started game', async () => {
    const { players } = await readyTeamLobby();
    const [harvey, nora, alex] = players;
    expect(failureOf(await moveToSeat(harvey.socket, 'TEAM_2', 0)).code).toBe('CONFLICT'); // Nora sits there
    expect(failureOf(await moveToSeat(alex.socket, 'TEAM_1', 1)).code).toBe('CONFLICT'); // their own seat

    okOf(await start(harvey.socket));
    expect(failureOf(await moveToSeat(nora.socket, 'TEAM_1', 0)).code).toBe('CONFLICT');
    expect(failureOf(await requestSeatSwap(nora.socket, harvey.playerId)).code).toBe('CONFLICT');
  });

  it('lets exactly one of two concurrent moves take an empty seat', async () => {
    const { players, persistence, roomId } = await readyTeamLobby();
    const [harvey, , alex, zed] = players;
    okOf(await leave(zed.socket));
    const [first, second] = await Promise.all([
      moveToSeat(harvey.socket, 'TEAM_2', 1),
      moveToSeat(alex.socket, 'TEAM_2', 1),
    ]);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    const room = await stored(persistence, roomId);
    const holders = Object.values(room.gameSnapshot.gameState.players).filter((player) => player.teamId === 'TEAM_2' && player.teamSlot === 1);
    expect(holders).toHaveLength(1);
  });

  it('moves nobody until the target accepts, then exchanges both seats across teams', async () => {
    const { players, persistence, roomId } = await readyTeamLobby();
    const [harvey, nora, alex, zed] = players;

    okOf(await requestSeatSwap(nora.socket, harvey.playerId));
    let room = await stored(persistence, roomId);
    expect(requestsOf(room)).toEqual([{ requesterPlayerId: nora.playerId, targetPlayerId: harvey.playerId }]);
    expect(seatOf(room, harvey.playerId)).toEqual(['TEAM_1', 0]);
    expect(seatOf(room, nora.playerId)).toEqual(['TEAM_2', 0]);
    expect(Object.values(room.gameSnapshot.members).every((member) => member.ready)).toBe(true);

    // Only the target can answer: Alex (a bystander) and the requester themself cannot.
    expect(failureOf(await respondSeatSwap(alex.socket, nora.playerId, true)).code).toBe('CONFLICT');
    expect(failureOf(await respondSeatSwap(nora.socket, nora.playerId, true)).code).toBe('CONFLICT');
    expect(requestsOf(await stored(persistence, roomId))).toHaveLength(1);

    okOf(await respondSeatSwap(harvey.socket, nora.playerId, true));
    room = await stored(persistence, roomId);
    expect(seatOf(room, harvey.playerId)).toEqual(['TEAM_2', 0]);
    expect(seatOf(room, nora.playerId)).toEqual(['TEAM_1', 0]);
    expect(room.gameSnapshot.gameState.players[harvey.playerId]).toMatchObject({ color: 'blue', characterId: 'dog' });
    expect(room.gameSnapshot.gameState.players[nora.playerId]).toMatchObject({ color: 'red', characterId: 'dog' });
    expect(requestsOf(room)).toEqual([]);
    expect(isReady(room, harvey.playerId)).toBe(false);
    expect(isReady(room, nora.playerId)).toBe(false);
    expect(isReady(room, alex.playerId)).toBe(true);
    expect(isReady(room, zed.playerId)).toBe(true);
  });

  it('exchanges two teammates\' seats without resetting anyone\'s Ready', async () => {
    const { players, persistence, roomId } = await readyTeamLobby();
    const [harvey, , alex] = players;
    await swapSeats(harvey, alex);
    const room = await stored(persistence, roomId);
    expect(seatOf(room, harvey.playerId)).toEqual(['TEAM_1', 1]);
    expect(seatOf(room, alex.playerId)).toEqual(['TEAM_1', 0]);
    expect(Object.values(room.gameSnapshot.members).every((member) => member.ready)).toBe(true);
  });

  it('keeps a swapped player\'s mascot when it is still valid and clears it when it clashes with the new teammate', async () => {
    const { players, persistence, roomId } = await lobbyOfFour();
    const [harvey, nora, alex, zed] = players;
    okOf(await setMode(harvey.socket, 'TEAM_2V2'));
    // Team 1: Harvey dog + Alex cat; Team 2: Nora cat + Zed panda. Swapping Harvey with Nora puts Nora (cat) next to Alex (cat).
    okOf(await appearance(harvey.socket, { characterId: 'dog' }));
    okOf(await appearance(alex.socket, { characterId: 'cat' }));
    okOf(await appearance(nora.socket, { characterId: 'cat' }));
    okOf(await appearance(zed.socket, { characterId: 'panda' }));
    await swapSeats(harvey, nora);
    const state = (await stored(persistence, roomId)).gameSnapshot.gameState;
    expect(state.players[harvey.playerId].characterId).toBe('dog'); // joined Zed (panda): still valid
    expect(state.players[nora.playerId].characterId).toBeNull(); // clashed with Alex, who stayed
    expect(state.players[alex.playerId].characterId).toBe('cat');
  });

  it('keeps one open request per requester, and lets the target decline or the requester cancel', async () => {
    const { players, persistence, roomId } = await readyTeamLobby();
    const [harvey, nora, alex, zed] = players;

    okOf(await requestSeatSwap(nora.socket, alex.playerId));
    okOf(await requestSeatSwap(nora.socket, zed.playerId)); // replaces the first question
    expect(requestsOf(await stored(persistence, roomId))).toEqual([
      { requesterPlayerId: nora.playerId, targetPlayerId: zed.playerId },
    ]);

    okOf(await requestSeatSwap(harvey.socket, zed.playerId)); // two requests to one target may wait together
    expect(requestsOf(await stored(persistence, roomId))).toHaveLength(2);

    okOf(await respondSeatSwap(zed.socket, nora.playerId, false)); // declined: nothing moves
    let room = await stored(persistence, roomId);
    expect(requestsOf(room)).toEqual([{ requesterPlayerId: harvey.playerId, targetPlayerId: zed.playerId }]);
    expect(seatOf(room, nora.playerId)).toEqual(['TEAM_2', 0]);
    expect(isReady(room, nora.playerId)).toBe(true);

    okOf(await cancelSeatSwap(harvey.socket));
    expect(requestsOf(await stored(persistence, roomId))).toEqual([]);
    okOf(await cancelSeatSwap(harvey.socket)); // nothing left to cancel is not an error
    expect(failureOf(await respondSeatSwap(zed.socket, harvey.playerId, true)).code).toBe('CONFLICT'); // answering a cancelled request
    room = await stored(persistence, roomId);
    expect(seatOf(room, zed.playerId)).toEqual(['TEAM_2', 1]);
  });

  it('refuses a request to oneself, to somebody who is not in the lobby and any seat command in Solo', async () => {
    const { players } = await readyTeamLobby();
    const [harvey, nora] = players;
    expect(failureOf(await requestSeatSwap(harvey.socket, harvey.playerId)).code).toBe('CONFLICT');
    expect(failureOf(await requestSeatSwap(harvey.socket, randomUUID())).code).toBe('CONFLICT');

    okOf(await setMode(harvey.socket, 'SOLO'));
    expect(failureOf(await requestSeatSwap(nora.socket, harvey.playerId)).code).toBe('CONFLICT');
    expect(failureOf(await respondSeatSwap(harvey.socket, nora.playerId, true)).code).toBe('CONFLICT');
    expect(failureOf(await cancelSeatSwap(nora.socket)).code).toBe('CONFLICT');
  });

  it('voids a request when either side moves, leaves or is removed, when the mode changes and when the game starts', async () => {
    const { players, persistence, roomId } = await readyTeamLobby();
    const [harvey, nora, alex, zed] = players;

    // The requester takes another seat.
    okOf(await requestSeatSwap(nora.socket, harvey.playerId));
    okOf(await leave(zed.socket));
    okOf(await moveToSeat(nora.socket, 'TEAM_2', 1));
    expect(requestsOf(await stored(persistence, roomId))).toEqual([]);

    // The target leaves the room.
    okOf(await requestSeatSwap(alex.socket, nora.playerId));
    expect(requestsOf(await stored(persistence, roomId))).toHaveLength(1);
    okOf(await leave(nora.socket));
    expect(requestsOf(await stored(persistence, roomId))).toEqual([]);

    // The host removes the requester.
    okOf(await requestSeatSwap(alex.socket, harvey.playerId));
    okOf(await kick(harvey.socket, alex.playerId));
    expect(requestsOf(await stored(persistence, roomId))).toEqual([]);
  });

  it('voids every request when the mode changes and clears them when the game starts', async () => {
    const { players, persistence, roomId } = await readyTeamLobby();
    const [harvey, nora, alex] = players;

    okOf(await requestSeatSwap(nora.socket, harvey.playerId));
    okOf(await setMode(harvey.socket, 'SOLO'));
    expect(requestsOf(await stored(persistence, roomId))).toEqual([]);

    okOf(await setMode(harvey.socket, 'TEAM_2V2'));
    await readyEveryone(players);
    okOf(await requestSeatSwap(alex.socket, harvey.playerId));
    okOf(await start(harvey.socket));
    const room = await stored(persistence, roomId);
    expect(room.status).toBe('IN_PROGRESS');
    expect(requestsOf(room)).toEqual([]);
  });

  it('shows an open request to a player who reconnects, because it is part of the room state', async () => {
    const { subject, players } = await readyTeamLobby();
    const [harvey, nora] = players;
    okOf(await requestSeatSwap(nora.socket, harvey.playerId));

    harvey.socket.disconnect();
    const reconnected = await resume(await connect(subject.url), harvey.token);
    expect(reconnected.room.gameState.boardState.seatSwapRequests).toEqual([
      { requesterPlayerId: nora.playerId, targetPlayerId: harvey.playerId },
    ]);
  });

  it('orders the match by seat: the opposing team\'s seat 0 follows the starter and its seat 1 comes last', async () => {
    const { players, persistence, roomId } = await readyTeamLobby();
    const [harvey, nora, alex, zed] = players;
    await swapSeats(nora, zed); // Zed now holds Team 2 seat 0 and Nora seat 1 (same team: Ready is kept)
    okOf(await ready(harvey.socket, true));
    okOf(await start(harvey.socket));

    const state = (await stored(persistence, roomId)).gameSnapshot.gameState;
    const order = state.boardState.teamPlay.slotOrder;
    const teamOf = (playerId: string) => state.players[playerId].teamId;
    const starter = order[0];
    const opposing = starter === harvey.playerId || starter === alex.playerId
      ? { first: zed.playerId, second: nora.playerId }
      : { first: harvey.playerId, second: alex.playerId };
    expect(order[1]).toBe(opposing.first);
    expect(order[3]).toBe(opposing.second);
    expect(teamOf(order[2])).toBe(teamOf(starter));
  });

  it('lays a replayed lobby out again with two distinct seats per team', async () => {
    const { players, persistence, roomId } = await readyTeamLobby();
    const [harvey, nora, alex, zed] = players;
    okOf(await start(harvey.socket));
    // End the game: both Team 2 players leave, Team 1 wins.
    okOf(await leave(zed.socket));
    okOf(await leave(nora.socket));
    expect((await stored(persistence, roomId)).status).toBe('FINISHED');
    okOf(await playAgain(harvey.socket));

    const room = await stored(persistence, roomId);
    expect(room.status).toBe('LOBBY');
    expect(new Set([harvey, alex].map((player) => seatOf(room, player.playerId).join(':'))).size).toBe(2);
    expect(requestsOf(room)).toEqual([]);
  });
});

describe('removing a player from the lobby', () => {
  it('lets the host remove another player: their seat is freed, their session is revoked and they are told', async () => {
    const { subject, players, persistence, roomId } = await lobbyOfFour();
    const [harvey, nora, alex] = players;

    const notified = new Promise<RemovedFromRoomInfo>((resolve) => { nora.socket.once('removed from room', resolve); });
    okOf(await kick(harvey.socket, nora.playerId));
    expect(await notified).toMatchObject({ code: 'REMOVED_BY_HOST' });

    const room = await stored(persistence, roomId);
    expect(room.gameSnapshot.members[nora.playerId]).toBeUndefined();
    expect(room.gameSnapshot.gameState.players[nora.playerId]).toBeUndefined();
    expect(room.gameSnapshot.gameState.boardState.players).toHaveLength(3);
    expect(room.gameSnapshot.gameState.boardState.logs.some((line) => line.includes('mời ra khỏi phòng'))).toBe(true);

    // The old token can never bring the player back as themselves.
    const staleSocket = await connect(subject.url);
    const stale = failureOf(await ack<ResumeSessionResult>((callback) => {
      staleSocket.emit('resume session', { token: nora.token }, callback);
    }));
    expect(['SESSION_REVOKED', 'SESSION_INVALID']).toContain(stale.code);

    // Their commands from the old connection no longer work (they left the room channels and the socket data was cleared).
    expect(failureOf(await ready(nora.socket)).code).toBe('UNAUTHENTICATED');

    // The seat they held is the first one a new joiner takes, and the removed player may join again from the code.
    const rejoined = await join(await connect(subject.url), 'Nora again', room.code);
    const after = await stored(persistence, roomId);
    expect(seatOf(after, rejoined.playerId)).toEqual(['TEAM_2', 0]);
    expect(Object.keys(after.gameSnapshot.members)).toContain(alex.playerId);
  });

  it('is host-only, lobby-only and never aimed at oneself or at a stranger', async () => {
    const { players, persistence, roomId } = await lobbyOfFour();
    const [harvey, nora, alex] = players;

    expect(failureOf(await kick(nora.socket, alex.playerId)).code).toBe('FORBIDDEN');
    expect(failureOf(await kick(harvey.socket, harvey.playerId)).code).toBe('CONFLICT');
    expect(failureOf(await kick(harvey.socket, randomUUID())).code).toBe('CONFLICT');
    expect(Object.keys((await stored(persistence, roomId)).gameSnapshot.members)).toHaveLength(4);

    okOf(await setMode(harvey.socket, 'TEAM_2V2'));
    await readyEveryone(players);
    okOf(await start(harvey.socket));
    expect(failureOf(await kick(harvey.socket, alex.playerId)).code).toBe('CONFLICT'); // the game has started
    expect(Object.keys((await stored(persistence, roomId)).gameSnapshot.members)).toHaveLength(4);
  });

  it('works for a player whose connection is already gone, and in a Solo lobby', async () => {
    const { players, persistence, roomId } = await lobbyOfFour();
    const [harvey, , alex] = players;
    alex.socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    okOf(await kick(harvey.socket, alex.playerId));
    const room = await stored(persistence, roomId);
    expect(room.gameSnapshot.members[alex.playerId]).toBeUndefined();
    expect(room.gameSnapshot.gameState.boardState.gameMode).toBe('SOLO');
    expect(Object.keys(room.gameSnapshot.members)).toHaveLength(3);
  });
});
