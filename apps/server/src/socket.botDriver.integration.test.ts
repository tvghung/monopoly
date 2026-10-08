import type { GameState, OfferResult, PlayerColorId } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BotDriver } from './bots/driver.js';
import { rollDiceCommand, runGameCommand } from './commands/gameplay.js';
import { removePlayerFromGame } from './game/index.js';
import { InMemoryPersistenceStore } from './persistence/inMemory.js';
import type { RoomRecord } from './persistence/types.js';
import {
  hydrateGameState,
  storeGameState,
  syncMembershipWithGameState,
  type RoomSnapshot,
} from './rooms.js';
import { recoverRoomIfDue } from './services/deadlineScheduler.js';
import { CommandError } from './socket/errors.js';
import {
  ack,
  addBot,
  appearance,
  connect,
  dataOf,
  join,
  mutateRoom,
  okOf,
  playAgain,
  ready,
  resume,
  start,
  startServer,
  stored,
  useHarnessCleanup,
  type RunningServer,
} from './testing/teamHarness.js';

useHarnessCleanup();
afterEach(() => {
  vi.restoreAllMocks();
});

let codeCounter = 0;

/** Math.random values that make `rollDice` return exactly these two dice. */
const diceRandom = (dice1: number, dice2: number): void => {
  vi.spyOn(Math, 'random')
    .mockReturnValueOnce((dice1 - 0.5) / 6)
    .mockReturnValueOnce((dice2 - 0.5) / 6);
};

/** A started 1 human + N bots game whose driver is paused, so each test arranges the position before the bots move. */
async function botGame({ bots = 1, delayScale = 0 }: { bots?: number; delayScale?: number } = {}) {
  const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
  const subject = await startServer(persistence, { bots: { delayScale, sweepIntervalMs: 40 } });
  codeCounter += 1;
  const host = await join(await connect(subject.url), 'Host', `DRIVE-${String(codeCounter)}`);
  okOf(await appearance(host.socket, { characterId: 'dog' }));
  okOf(await ready(host.socket));
  const botIds: string[] = [];
  for (let index = 0; index < bots; index += 1) botIds.push(dataOf(await addBot(host.socket)).playerId);
  subject.bots?.stop();
  okOf(await start(host.socket));
  return { subject, persistence, host, botIds, botId: botIds[0], roomId: host.room.roomId };
}

/** Rewrites the stored room through the game-state view (the result must still be a valid snapshot). */
function arrange(
  persistence: InMemoryPersistenceStore<RoomSnapshot>,
  roomId: string,
  mutate: (state: GameState, room: RoomRecord<RoomSnapshot>) => void,
): Promise<RoomRecord<RoomSnapshot>> {
  return mutateRoom(persistence, roomId, (room) => {
    const state = hydrateGameState(room.gameSnapshot, room.status);
    mutate(state, room);
    storeGameState(room.gameSnapshot, state, room.status);
    syncMembershipWithGameState(room.gameSnapshot);
  });
}

/** Makes `playerId` the current player at the start of a fresh turn on `tile`. */
const turnOf = (state: GameState, playerId: string, tile = 0): void => {
  state.boardState.currentPlayer = { id: playerId, hasMoved: false };
  state.boardState.turnRecovery = null;
  state.turnInfo = {};
  state.players[playerId].currentTile = tile;
};

const own = (state: GameState, tileID: number, ownerId: string, houses = 0): void => {
  const color: PlayerColorId = state.players[ownerId].color;
  state.boardState.ownedProps[tileID] = { id: ownerId, color, houses };
};

function resumeBots(subject: RunningServer, roomId: string): BotDriver {
  const driver = subject.bots;
  if (!driver) throw new Error('bots missing');
  driver.start();
  driver.notify(roomId);
  return driver;
}

async function until(
  persistence: InMemoryPersistenceStore<RoomSnapshot>,
  roomId: string,
  done: (room: RoomRecord<RoomSnapshot> | null) => boolean,
  timeoutMs = 4_000,
): Promise<RoomRecord<RoomSnapshot> | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const room = await persistence.rooms.findById(roomId);
    if (done(room)) return room;
    if (Date.now() > deadline) throw new Error(`condition not reached; last state ${JSON.stringify(room?.gameSnapshot.gameState.boardState.currentPlayer)}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('bot driver: one turn at a time through the shared commands', () => {
  it('rolls once, buys a good street and hands the turn back to the human', async () => {
    const { subject, persistence, roomId, host, botId } = await botGame();
    await arrange(persistence, roomId, (state) => turnOf(state, botId));
    diceRandom(1, 2); // tile 3, Bạc Liêu, price 60
    const driver = resumeBots(subject, roomId);

    const room = await until(persistence, roomId, (candidate) => (
      candidate?.gameSnapshot.gameState.boardState.currentPlayer.id === host.playerId
    ));
    const { boardState, players } = room!.gameSnapshot.gameState;
    expect(boardState.rollSequence).toBe(1);
    expect(boardState.ownedProps[3]?.id).toBe(botId);
    expect(players[botId].accountBalance).toBe(1440);
    expect(driver.journal(roomId).some((line) => line.includes('TURN -> roll dice'))).toBe(true);
    expect(driver.journal(roomId).some((line) => line.includes('PURCHASE -> buy property'))).toBe(true);
  });

  it('never repeats an effect for duplicate notifications or a second driver over the same rooms', async () => {
    const { subject, persistence, roomId, host, botId } = await botGame();
    await arrange(persistence, roomId, (state) => turnOf(state, botId));
    diceRandom(1, 2);
    const second = new BotDriver(subject.io, subject.runtime, { delayScale: 0, sweepIntervalMs: 10 });
    second.start();
    const first = resumeBots(subject, roomId);
    for (let index = 0; index < 25; index += 1) {
      first.notify(roomId);
      second.notify(roomId);
    }
    const room = await until(persistence, roomId, (candidate) => (
      candidate?.gameSnapshot.gameState.boardState.currentPlayer.id === host.playerId
    ));
    second.stop();
    expect(room!.gameSnapshot.gameState.boardState.rollSequence).toBe(1);
    expect(room!.gameSnapshot.gameState.players[botId].accountBalance).toBe(1440);
    const purchases = room!.gameSnapshot.gameState.boardState.gameplayEvents.events
      .filter((event) => event.type === 'MONEY_TRANSFER' && event.reason === 'PROPERTY_PURCHASE');
    expect(purchases).toHaveLength(1);
  });

  it('pays bail in a safe board, then rolls and buys', async () => {
    const { subject, persistence, roomId, host, botId } = await botGame();
    await arrange(persistence, roomId, (state) => {
      turnOf(state, botId, 10);
      state.players[botId].isJail = true;
      state.players[botId].jailOpponentRoundsElapsed = 0;
    });
    diceRandom(1, 2); // 10 + 3 = tile 13, Hội An, price 140
    const driver = resumeBots(subject, roomId);
    const room = await until(persistence, roomId, (candidate) => (
      candidate?.gameSnapshot.gameState.boardState.currentPlayer.id === host.playerId
    ));
    const bot = room!.gameSnapshot.gameState.players[botId];
    expect(bot.isJail).toBe(false);
    expect(bot.accountBalance).toBe(1500 - 25 - 140);
    expect(room!.gameSnapshot.gameState.boardState.ownedProps[13]?.id).toBe(botId);
    expect(driver.journal(roomId).some((line) => line.includes('TURN -> pay bail'))).toBe(true);
  });

  it('dismisses its own revealed card and lets the turn finish', async () => {
    const { subject, persistence, roomId, host, botId } = await botGame();
    await arrange(persistence, roomId, (state) => turnOf(state, botId));
    diceRandom(3, 4); // tile 7, Cơ Hội
    const driver = resumeBots(subject, roomId);
    const room = await until(persistence, roomId, (candidate) => {
      const board = candidate?.gameSnapshot.gameState.boardState;
      return Boolean(board && (board.winner || board.currentPlayer.id === host.playerId));
    });
    expect(room!.gameSnapshot.gameState.turnInfo.pendingCardInteraction).toBeUndefined();
    expect(room!.gameSnapshot.gameState.privateState.completedCardOperations
      .some((operation) => operation.playerId === botId)).toBe(true);
    expect(driver.journal(roomId).some((line) => line.includes('CARD -> dismiss card'))).toBe(true);
  });

  it('liquidates, goes bankrupt and is left out of the game without being replaced', async () => {
    const { subject, persistence, roomId, host, botId } = await botGame();
    await arrange(persistence, roomId, (state) => {
      turnOf(state, botId);
      state.players[botId].accountBalance = 10;
      own(state, 1, botId);
      own(state, 3, host.playerId, 5); // a hotel: rent 450
    });
    diceRandom(1, 2); // lands on the hotel
    resumeBots(subject, roomId);
    const room = await until(persistence, roomId, (candidate) => candidate?.status === 'FINISHED');
    const { boardState } = room!.gameSnapshot.gameState;
    expect(boardState.finishedPlayers[botId]?.reason).toBe('BANKRUPT');
    expect(boardState.winner?.playerId).toBe(host.playerId);
    expect(boardState.ownedProps[1]).toBeUndefined();
    expect(room!.gameSnapshot.members[botId]).toMatchObject({ kind: 'BOT', membershipStatus: 'FINISHED' });
    expect(Object.keys(room!.gameSnapshot.members)).toHaveLength(2);
  });

  it('accepts a clearly good trade offer and declines a poor one, without ever proposing', async () => {
    const { subject, persistence, roomId, host, botId } = await botGame();
    await arrange(persistence, roomId, (state) => {
      turnOf(state, host.playerId);
      own(state, 1, botId);
      own(state, 39, botId);
    });
    resumeBots(subject, roomId);

    const answered = (event: 'offer accepted' | 'offer declined') => new Promise<OfferResult>((resolve) => {
      host.socket.once(event, resolve);
    });
    const accepted = answered('offer accepted');
    okOf(await ack((callback) => host.socket.emit('make offer', {
      recipientPlayerId: botId,
      offered: { cash: 400, propertyIds: [], jailFreeCardIds: [] },
      requested: { cash: 0, propertyIds: [1], jailFreeCardIds: [] },
    }, callback as never)));
    expect((await accepted).status).toBe('ACCEPTED');

    const declined = answered('offer declined');
    okOf(await ack((callback) => host.socket.emit('make offer', {
      recipientPlayerId: botId,
      offered: { cash: 5, propertyIds: [], jailFreeCardIds: [] },
      requested: { cash: 0, propertyIds: [39], jailFreeCardIds: [] },
    }, callback as never)));
    expect((await declined).status).toBe('DECLINED');

    const room = await stored(persistence, roomId);
    expect(room.gameSnapshot.gameState.boardState.ownedProps[1]?.id).toBe(host.playerId);
    expect(room.gameSnapshot.gameState.boardState.ownedProps[39]?.id).toBe(botId);
    expect(room.gameSnapshot.gameState.players[botId].accountBalance).toBe(1900);
    expect(await subject.runtime.persistence.tradeOffers.listPendingForPlayer(roomId, host.playerId)).toEqual([]);
  });
});

describe('bot driver: fairness, pause and cancellation', () => {
  it('is refused an illegal command exactly like a human would be', async () => {
    const { subject, persistence, roomId, host, botId } = await botGame();
    await arrange(persistence, roomId, (state) => turnOf(state, host.playerId));
    await expect(runGameCommand(subject.io, subject.runtime, rollDiceCommand, roomId, botId, undefined))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(runGameCommand(subject.io, subject.runtime, rollDiceCommand, roomId, botId, undefined))
      .rejects.toBeInstanceOf(CommandError);
    expect((await stored(persistence, roomId)).gameSnapshot.gameState.boardState.rollSequence).toBe(0);
  });

  it('waits while every human is disconnected and plays on when one comes back', async () => {
    const { subject, persistence, roomId, host, botId } = await botGame();
    await arrange(persistence, roomId, (state) => turnOf(state, botId));
    host.socket.disconnect();
    await pause(60);
    const driver = resumeBots(subject, roomId);
    await pause(300);
    expect((await stored(persistence, roomId)).gameSnapshot.gameState.boardState.rollSequence).toBe(0);
    expect(driver.armedKey(roomId)).toBeUndefined();

    diceRandom(1, 2);
    await resume(await connect(subject.url), host.token);
    const room = await until(persistence, roomId, (candidate) => (
      candidate?.gameSnapshot.gameState.boardState.rollSequence === 1
    ));
    expect(room!.gameSnapshot.gameState.players[botId].currentTile).toBe(3);
  });

  it('drops a pending bot action when the match ends and the room returns to the lobby', async () => {
    const { subject, persistence, roomId, host, botId } = await botGame({ delayScale: 1 });
    await arrange(persistence, roomId, (state) => turnOf(state, botId));
    const driver = resumeBots(subject, roomId);
    await until(persistence, roomId, () => driver.armedKey(roomId) !== undefined);

    await arrange(persistence, roomId, (state, room) => {
      removePlayerFromGame(state, botId, 'BANKRUPT');
      room.status = 'FINISHED';
      state.boardState.turnRecovery = null;
      state.turnInfo = {};
    });
    okOf(await playAgain(host.socket));
    await pause(1_800); // longer than the armed 1.5 s roll delay
    const room = await stored(persistence, roomId);
    expect(room.status).toBe('LOBBY');
    expect(room.gameSnapshot.gameState.boardState.rollSequence).toBe(0);
    expect(driver.journal(roomId).some((line) => line.includes('roll dice'))).toBe(false);
    expect(room.gameSnapshot.members[botId]).toMatchObject({ kind: 'BOT', ready: true });
  });
});

describe('disconnected human with a revealed card', () => {
  it('applies the card once the reconnect grace expires instead of blocking the game', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const subject = await startServer(persistence);
    codeCounter += 1;
    const code = `CARD-${String(codeCounter)}`;
    const host = await join(await connect(subject.url), 'Host', code);
    const guest = await join(await connect(subject.url), 'Guest', code);
    okOf(await appearance(host.socket, { characterId: 'dog' }));
    okOf(await appearance(guest.socket, { characterId: 'cat' }));
    okOf(await ready(host.socket));
    okOf(await ready(guest.socket));
    okOf(await start(host.socket));
    const roomId = host.room.roomId;
    await arrange(persistence, roomId, (state) => turnOf(state, guest.playerId));
    diceRandom(3, 4); // Cơ Hội
    okOf(await ack((callback) => guest.socket.emit('roll dice', callback)));
    const revealed = (await stored(persistence, roomId)).gameSnapshot.gameState.turnInfo.pendingCardInteraction;
    expect(revealed?.stage).toBe('REVEALED');

    guest.socket.disconnect();
    const armed = await until(persistence, roomId, (room) => Boolean(room?.gameSnapshot.gameState.boardState.turnRecovery));
    expect(armed!.gameSnapshot.gameState.boardState.turnRecovery?.pendingOperationId).toBe(revealed?.operationId);

    await recoverRoomIfDue(subject.io, subject.runtime, roomId, new Date(Date.now() + 61_000));
    const room = await stored(persistence, roomId);
    expect(room.gameSnapshot.gameState.turnInfo.pendingCardInteraction?.operationId).not.toBe(revealed?.operationId);
    expect(room.gameSnapshot.gameState.privateState.completedCardOperations
      .some((operation) => operation.operationId === revealed?.operationId)).toBe(true);
    expect(room.gameSnapshot.members[guest.playerId].membershipStatus).toBe('ACTIVE'); // the seat is kept, no takeover
  });
});
