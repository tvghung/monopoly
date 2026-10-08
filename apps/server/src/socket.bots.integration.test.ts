import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { removePlayerFromGame } from './game/index.js';
import { InMemoryPersistenceStore } from './persistence/inMemory.js';
import {
  hydrateGameState,
  storeGameState,
  syncMembershipWithGameState,
  type RoomSnapshot,
} from './rooms.js';
import {
  ack,
  addBot,
  appearance,
  connect,
  dataOf,
  failureOf,
  join,
  kick,
  leave,
  mutateRoom,
  okOf,
  playAgain,
  ready,
  removeBot,
  requestSeatSwap,
  setMode,
  start,
  startServer,
  stored,
  useHarnessCleanup,
  type Player,
} from './testing/teamHarness.js';

useHarnessCleanup();

let codeCounter = 0;

/** A host alone in a fresh lobby (with a mascot, not Ready yet), plus the server around it. */
async function hostLobby() {
  const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
  const subject = await startServer(persistence);
  codeCounter += 1;
  const code = `BOTS-${String(codeCounter)}`;
  const host = await join(await connect(subject.url), 'Host', code);
  okOf(await appearance(host.socket, { characterId: 'dog' }));
  const joinHuman = async (name: string, characterId: 'cat' | 'panda' | 'rabbit' = 'cat'): Promise<Player> => {
    const player = await join(await connect(subject.url), name, code);
    okOf(await appearance(player.socket, { characterId }));
    return player;
  };
  return { subject, persistence, host, code, roomId: host.room.roomId, joinHuman };
}

const botIdsOf = (snapshot: RoomSnapshot): string[] => Object.entries(snapshot.members)
  .filter(([, member]) => member.kind === 'BOT')
  .map(([playerId]) => playerId);

const activeCount = (snapshot: RoomSnapshot): number => Object.values(snapshot.members)
  .filter((member) => member.membershipStatus === 'ACTIVE').length;

describe('bot seats in the lobby', () => {
  it('adds one Ready bot per request, named Bot 1..3 with its own mascot, and projects it as a present bot', async () => {
    const { host, persistence, roomId } = await hostLobby();
    const first = dataOf(await addBot(host.socket));
    const second = dataOf(await addBot(host.socket));
    const third = dataOf(await addBot(host.socket));
    const room = await stored(persistence, roomId);
    const { players } = room.gameSnapshot.gameState;

    expect([first, second, third].map(({ playerId }) => players[playerId].name)).toEqual(['Bot 1', 'Bot 2', 'Bot 3']);
    for (const { playerId } of [first, second, third]) {
      expect(room.gameSnapshot.members[playerId]).toMatchObject({ kind: 'BOT', ready: true, membershipStatus: 'ACTIVE' });
      expect(players[playerId].characterId).not.toBeNull();
    }
    const combinations = Object.values(players).map((player) => `${String(player.characterId)}:${player.color}`);
    expect(new Set(combinations).size).toBe(combinations.length);

    const projected = await new Promise<import('@monopoly/shared').PublicRoomState>((resolve) => {
      host.socket.once('update', resolve);
      void ready(host.socket);
    });
    const bot = projected.players.find((player) => player.playerId === first.playerId);
    expect(bot).toMatchObject({ kind: 'BOT', connected: true, ready: true, name: 'Bot 1' });
    expect(projected.players.find((player) => player.playerId === host.playerId)?.kind).toBe('HUMAN');
  });

  it('answers a repeated request id with the same bot instead of adding another', async () => {
    const { host, persistence, roomId } = await hostLobby();
    const requestId = randomUUID();
    const first = dataOf(await addBot(host.socket, requestId));
    const replay = dataOf(await addBot(host.socket, requestId));
    expect(replay.playerId).toBe(first.playerId);
    expect(botIdsOf((await stored(persistence, roomId)).gameSnapshot)).toEqual([first.playerId]);

    // Two copies of one click racing each other still add exactly one bot.
    const raced = randomUUID();
    const [left, right] = await Promise.all([addBot(host.socket, raced), addBot(host.socket, raced)]);
    expect(dataOf(left).playerId).toBe(dataOf(right).playerId);
    expect(botIdsOf((await stored(persistence, roomId)).gameSnapshot)).toHaveLength(2);
  });

  it('never lets a guest add or remove a bot, and leaves the room unchanged when it tries', async () => {
    const { host, persistence, roomId, joinHuman } = await hostLobby();
    const guest = await joinHuman('Guest');
    const bot = dataOf(await addBot(host.socket));
    const before = await stored(persistence, roomId);

    expect(failureOf(await addBot(guest.socket)).code).toBe('FORBIDDEN');
    expect(failureOf(await removeBot(guest.socket, bot.playerId)).code).toBe('FORBIDDEN');
    const after = await stored(persistence, roomId);
    expect(after.aggregateVersion).toBe(before.aggregateVersion);
    expect(botIdsOf(after.gameSnapshot)).toEqual([bot.playerId]);
  });

  it('removes only an existing bot: a stale remove, a human target and kicking a bot change nothing', async () => {
    const { host, persistence, roomId, joinHuman } = await hostLobby();
    const guest = await joinHuman('Guest');
    const bot = dataOf(await addBot(host.socket));

    expect(failureOf(await kick(host.socket, bot.playerId)).code).toBe('CONFLICT');
    expect(failureOf(await removeBot(host.socket, guest.playerId)).code).toBe('CONFLICT');
    okOf(await removeBot(host.socket, bot.playerId));
    expect(failureOf(await removeBot(host.socket, bot.playerId)).code).toBe('NOT_FOUND');
    const room = await stored(persistence, roomId);
    expect(botIdsOf(room.gameSnapshot)).toEqual([]);
    expect(activeCount(room.gameSnapshot)).toBe(2);
  });

  it('keeps the bot numbers predictable when a bot is removed and another is added', async () => {
    const { host, persistence, roomId } = await hostLobby();
    const bots = [dataOf(await addBot(host.socket)), dataOf(await addBot(host.socket)), dataOf(await addBot(host.socket))];
    okOf(await removeBot(host.socket, bots[1].playerId));
    const again = dataOf(await addBot(host.socket));
    const room = await stored(persistence, roomId);
    expect(room.gameSnapshot.gameState.players[again.playerId].name).toBe('Bot 2');
    expect(room.gameSnapshot.gameState.players[bots[0].playerId].name).toBe('Bot 1');
    expect(room.gameSnapshot.gameState.players[bots[2].playerId].name).toBe('Bot 3');
  });

  it('answers Room full to a human when host and bots fill the four seats, and admits them after a bot is removed', async () => {
    const { subject, host, persistence, roomId, code } = await hostLobby();
    const bots = [dataOf(await addBot(host.socket)), dataOf(await addBot(host.socket)), dataOf(await addBot(host.socket))];
    expect(failureOf(await addBot(host.socket)).code).toBe('ROOM_FULL');

    const outsider = await connect(subject.url);
    const refused = await ack<import('@monopoly/shared').JoinRoomResult>((callback) => outsider.emit('join room', { name: 'Late', roomCode: code }, callback));
    expect(failureOf(refused).code).toBe('ROOM_FULL');
    expect(botIdsOf((await stored(persistence, roomId)).gameSnapshot)).toHaveLength(3); // no bot was evicted

    okOf(await removeBot(host.socket, bots[0].playerId));
    const late = await join(outsider, 'Late', code);
    const room = await stored(persistence, roomId);
    expect(room.gameSnapshot.members[late.playerId]?.kind ?? 'HUMAN').toBe('HUMAN');
    expect(activeCount(room.gameSnapshot)).toBe(4);
  });

  it('gives the last seat to exactly one of a racing human join and bot additions', async () => {
    const { subject, host, persistence, roomId, code } = await hostLobby();
    okOf(await addBot(host.socket));
    okOf(await addBot(host.socket)); // 3 of 4 seats taken
    const outsider = await connect(subject.url);
    const [joined, botA, botB] = await Promise.allSettled([
      join(outsider, 'Racer', code),
      addBot(host.socket),
      addBot(host.socket),
    ]);
    const winners = [
      joined.status === 'fulfilled',
      botA.status === 'fulfilled' && botA.value.ok,
      botB.status === 'fulfilled' && botB.value.ok,
    ].filter(Boolean);
    expect(winners).toHaveLength(1);
    const room = await stored(persistence, roomId);
    expect(activeCount(room.gameSnapshot)).toBe(4);
  });

  it('keeps bots Ready with a valid mascot through a switch to 2v2, and swaps a human with a bot at once', async () => {
    const { host, persistence, roomId, joinHuman } = await hostLobby();
    const guest = await joinHuman('Guest');
    const botA = dataOf(await addBot(host.socket));
    dataOf(await addBot(host.socket));
    okOf(await setMode(host.socket, 'TEAM_2V2'));
    let room = await stored(persistence, roomId);
    for (const botId of botIdsOf(room.gameSnapshot)) {
      const bot = room.gameSnapshot.gameState.players[botId];
      expect(room.gameSnapshot.members[botId].ready).toBe(true);
      expect(bot.color).toBe(room.gameSnapshot.gameState.boardState.teams[bot.teamId].color);
      expect(bot.characterId).not.toBeNull();
    }

    const guestTeam = room.gameSnapshot.gameState.players[guest.playerId].teamId;
    const botTeam = room.gameSnapshot.gameState.players[botA.playerId].teamId;
    okOf(await requestSeatSwap(guest.socket, botA.playerId));
    room = await stored(persistence, roomId);
    expect(room.gameSnapshot.gameState.boardState.seatSwapRequests).toEqual([]);
    expect(room.gameSnapshot.gameState.players[guest.playerId].teamId).toBe(botTeam);
    expect(room.gameSnapshot.gameState.players[botA.playerId].teamId).toBe(guestTeam);
    expect(room.gameSnapshot.members[botA.playerId].ready).toBe(true);
  });
});

describe('bot seats in a 2v2 lobby', () => {
  it('puts the bot in the empty seat the host clicked, or where a joiner would sit when that seat is taken', async () => {
    const { host, persistence, roomId } = await hostLobby();
    okOf(await setMode(host.socket, 'TEAM_2V2'));
    const clicked = dataOf(await ack<import('@monopoly/shared').AddBotResult>((callback) => {
      host.socket.emit('add bot', { requestId: randomUUID(), seat: { teamId: 'TEAM_2', teamSlot: 1 } }, callback);
    }));
    let room = await stored(persistence, roomId);
    expect(room.gameSnapshot.gameState.players[clicked.playerId]).toMatchObject({ teamId: 'TEAM_2', teamSlot: 1, color: 'blue' });

    const fallback = dataOf(await ack<import('@monopoly/shared').AddBotResult>((callback) => {
      host.socket.emit('add bot', { requestId: randomUUID(), seat: { teamId: 'TEAM_2', teamSlot: 1 } }, callback);
    }));
    room = await stored(persistence, roomId);
    const seats = Object.values(room.gameSnapshot.gameState.players).map((player) => `${player.teamId}:${String(player.teamSlot)}`);
    expect(new Set(seats).size).toBe(3);
    expect(room.gameSnapshot.gameState.players[fallback.playerId].teamSlot).not.toBeUndefined();
  });
});

describe('starting with bots', () => {
  it('refuses a host alone, an unready human and a guest, and starts host + one bot', async () => {
    const { host, joinHuman, persistence, roomId } = await hostLobby();
    okOf(await ready(host.socket));
    expect(failureOf(await start(host.socket)).code).toBe('CONFLICT'); // 1H + 0B

    const guest = await joinHuman('Guest');
    okOf(await addBot(host.socket));
    expect(failureOf(await start(host.socket)).code).toBe('CONFLICT'); // the guest is not Ready
    okOf(await ready(guest.socket));
    expect(failureOf(await start(guest.socket)).code).toBe('FORBIDDEN');

    okOf(await leave(guest.socket));
    okOf(await start(host.socket)); // 1H + 1B
    const room = await stored(persistence, roomId);
    expect(room.status).toBe('IN_PROGRESS');
    expect(room.gameSnapshot.gameState.boardState.matchId).toMatch(/^[0-9a-f-]{36}$/);
    expect(room.gameSnapshot.gameState.boardState.players).toHaveLength(2);
    // A bot turn never arms the disconnected-player grace window.
    expect(room.gameSnapshot.gameState.boardState.turnRecovery).toBeNull();
  });

  it('starts every allowed mix and locks the seats afterwards', async () => {
    const { subject, host, code, persistence, roomId } = await hostLobby();
    okOf(await ready(host.socket));
    const bot = dataOf(await addBot(host.socket));
    okOf(await addBot(host.socket));
    okOf(await addBot(host.socket));
    okOf(await start(host.socket)); // 1H + 3B

    expect(failureOf(await addBot(host.socket)).code).toBe('GAME_ALREADY_STARTED');
    expect(failureOf(await removeBot(host.socket, bot.playerId)).code).toBe('GAME_ALREADY_STARTED');
    const watcher = await connect(subject.url);
    const admission = dataOf(await ack<import('@monopoly/shared').JoinRoomResult>((callback) => {
      watcher.emit('join room', { name: 'Watcher', roomCode: code }, callback);
    }));
    expect(admission.kind).toBe('SPECTATOR');
    expect(activeCount((await stored(persistence, roomId)).gameSnapshot)).toBe(4);
  });

  it('resolves a start racing a bot addition to one consistent outcome', async () => {
    const { host, persistence, roomId } = await hostLobby();
    okOf(await ready(host.socket));
    okOf(await addBot(host.socket));
    const [started, added] = await Promise.all([start(host.socket), addBot(host.socket)]);
    expect(started.ok).toBe(true);
    const room = await stored(persistence, roomId);
    const inGame = room.gameSnapshot.gameState.boardState.players;
    expect(inGame).toHaveLength(added.ok ? 3 : 2);
    expect(inGame).toEqual(expect.arrayContaining(botIdsOf(room.gameSnapshot)));
  });
});

describe('room lifecycle with bots', () => {
  it('passes the host to a human, never to a bot, and closes a lobby the last human leaves', async () => {
    const { host, joinHuman, persistence, roomId } = await hostLobby();
    const guest = await joinHuman('Guest');
    okOf(await addBot(host.socket));
    okOf(await leave(host.socket));
    expect((await stored(persistence, roomId)).hostPlayerId).toBe(guest.playerId);

    const left = await leave(guest.socket);
    expect(dataOf(left).roomDeleted).toBe(true);
    expect(await persistence.rooms.findById(roomId)).toBeNull();
  });

  it('closes a running game when its last human leaves instead of letting the bots play on', async () => {
    const { host, persistence, roomId } = await hostLobby();
    okOf(await ready(host.socket));
    okOf(await addBot(host.socket));
    okOf(await addBot(host.socket));
    okOf(await start(host.socket));
    expect(dataOf(await leave(host.socket)).roomDeleted).toBe(true);
    expect(await persistence.rooms.findById(roomId)).toBeNull();
  });

  it('brings bots back Ready on play again while humans ready up again, with a new match identity at the next start', async () => {
    const { host, persistence, roomId, joinHuman } = await hostLobby();
    const guest = await joinHuman('Guest');
    okOf(await ready(host.socket));
    okOf(await ready(guest.socket));
    const bot = dataOf(await addBot(host.socket));
    okOf(await start(host.socket));
    const firstMatch = (await stored(persistence, roomId)).gameSnapshot.gameState.boardState.matchId;

    // End the match: the bot and the guest go bankrupt, the host wins.
    await mutateRoom(persistence, roomId, (room) => {
      const state = hydrateGameState(room.gameSnapshot, room.status);
      removePlayerFromGame(state, bot.playerId, 'BANKRUPT');
      removePlayerFromGame(state, guest.playerId, 'BANKRUPT');
      room.status = 'FINISHED';
      state.boardState.turnRecovery = null;
      state.turnInfo = {};
      storeGameState(room.gameSnapshot, state, room.status);
      syncMembershipWithGameState(room.gameSnapshot);
    });
    expect((await stored(persistence, roomId)).gameSnapshot.gameState.boardState.finishedPlayers[bot.playerId]?.reason)
      .toBe('BANKRUPT');

    okOf(await playAgain(host.socket));
    let room = await stored(persistence, roomId);
    expect(room.status).toBe('LOBBY');
    expect(room.gameSnapshot.members[bot.playerId]).toMatchObject({ kind: 'BOT', ready: true, membershipStatus: 'ACTIVE' });
    expect(room.gameSnapshot.members[guest.playerId]).toMatchObject({ ready: false, membershipStatus: 'ACTIVE' });
    expect(room.gameSnapshot.members[host.playerId].ready).toBe(false);
    expect(room.gameSnapshot.gameState.players[bot.playerId].accountBalance).toBe(1500);
    expect(room.gameSnapshot.gameState.boardState.matchId ?? null).toBeNull();

    okOf(await ready(host.socket));
    okOf(await ready(guest.socket));
    okOf(await start(host.socket));
    room = await stored(persistence, roomId);
    expect(room.gameSnapshot.gameState.boardState.matchId).not.toBe(firstMatch);
  });
});
