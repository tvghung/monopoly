import type { GameState } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InMemoryPersistenceStore } from '../persistence/inMemory.js';
import type { RoomRecord } from '../persistence/types.js';
import {
  hydrateGameState,
  storeGameState,
  syncMembershipWithGameState,
  type RoomSnapshot,
} from '../rooms.js';
import { projectPrivatePlayerState, projectPublicRoomState } from '../services/publicState.js';
import {
  ack,
  addBot,
  appearance,
  connect,
  dataOf,
  join,
  mutateRoom,
  okOf,
  ready,
  start,
  startServer,
  stored,
  useHarnessCleanup,
} from '../testing/teamHarness.js';
import * as policy from './policy.js';
import { buildBotViews } from './view.js';

vi.mock('./policy.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./policy.js')>();
  return { ...original, decideBotAction: vi.fn(original.decideBotAction) };
});

useHarnessCleanup();
afterEach(() => {
  vi.mocked(policy.decideBotAction).mockReset();
  vi.restoreAllMocks();
});

let codeCounter = 0;

async function pausedBotGame(recoveryDelaysMs: readonly number[] = [20, 20]) {
  const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
  const subject = await startServer(persistence, { bots: { delayScale: 0, sweepIntervalMs: 30, recoveryDelaysMs } });
  codeCounter += 1;
  const host = await join(await connect(subject.url), 'Host', `FALL-${String(codeCounter)}`);
  okOf(await appearance(host.socket, { characterId: 'dog' }));
  okOf(await ready(host.socket));
  const botId = dataOf(await addBot(host.socket)).playerId;
  subject.bots?.stop();
  okOf(await start(host.socket));
  const roomId = host.room.roomId;
  await mutateRoom(persistence, roomId, (room: RoomRecord<RoomSnapshot>) => {
    const state: GameState = hydrateGameState(room.gameSnapshot, room.status);
    state.boardState.currentPlayer = { id: botId, hasMoved: false };
    state.turnInfo = {};
    state.players[botId].currentTile = 0;
    storeGameState(room.gameSnapshot, state, room.status);
    syncMembershipWithGameState(room.gameSnapshot);
  });
  return { subject, persistence, host, botId, roomId };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('bot driver liveness', () => {
  it('retries a refused first choice once with the always-legal fallback', async () => {
    const original = await vi.importActual<typeof import('./policy.js')>('./policy.js');
    vi.mocked(policy.decideBotAction).mockImplementation((view, task, random) => {
      const decision = original.decideBotAction(view, task, random);
      if (!decision || task.kind !== 'TURN') return decision;
      // An illegal first choice: buying with no purchase decision open.
      return { ...decision, action: { command: 'buy property', payload: { operationId: '00000000-0000-4000-8000-000000000000' } } };
    });
    const { subject, persistence, roomId, host } = await pausedBotGame();
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.05).mockReturnValueOnce(0.2);
    subject.bots?.start();
    subject.bots?.notify(roomId);
    for (let tries = 0; tries < 200; tries += 1) {
      if ((await stored(persistence, roomId)).gameSnapshot.gameState.boardState.currentPlayer.id === host.playerId) break;
      await pause(20);
    }
    const room = await stored(persistence, roomId);
    expect(room.gameSnapshot.gameState.boardState.rollSequence).toBe(1);
    const journal = subject.bots?.journal(roomId) ?? [];
    expect(journal.some((line) => line.includes('buy property refused (1)'))).toBe(true);
    expect(journal.some((line) => line.includes('TURN -> roll dice [fallback]'))).toBe(true);
  });

  /** Every choice for the bot's turn is illegal (it is not in jail), so the first choice and the fallback are refused. */
  const refuseEveryTurnChoice = () => vi.mocked(policy.decideBotAction).mockImplementation((_view, task) => ({
    task,
    action: { command: 'pay bail', payload: undefined },
    fallback: { command: 'use jail card', payload: undefined },
    reason: 'test',
  }));

  async function waitFor(check: () => Promise<boolean>, tries = 200): Promise<void> {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (await check()) return;
      await pause(20);
    }
  }

  it('after a bounded number of refusals hands the turn to the server turn recovery, once (BR)', async () => {
    refuseEveryTurnChoice();
    const { subject, persistence, roomId, host, botId } = await pausedBotGame();
    const before = await stored(persistence, roomId);
    subject.bots?.start();
    subject.bots?.notify(roomId);
    await waitFor(async () => (await stored(persistence, roomId)).gameSnapshot.gameState.boardState.currentPlayer.id === host.playerId);
    const after = await stored(persistence, roomId);
    const journal = [...(subject.bots?.journal(roomId) ?? [])];
    // First choice, fallback, then two fresh decisions further apart: four refusals, never more.
    expect(journal.filter((line) => line.includes(' refused ('))).toHaveLength(4);
    expect(journal.some((line) => line.includes('parked TURN (4 refused attempts)'))).toBe(true);
    expect(journal.some((line) => line.includes("could not resolve TURN; the server's turn recovery resolved it"))).toBe(true);
    // Legal and authoritative: the bot did not roll, the turn passed exactly as for an absent player.
    expect(after.gameSnapshot.gameState.boardState.rollSequence).toBe(before.gameSnapshot.gameState.boardState.rollSequence);
    expect(after.gameSnapshot.gameState.players[botId].accountBalance).toBe(before.gameSnapshot.gameState.players[botId].accountBalance);
    expect(after.gameSnapshot.gameState.boardState.turnRecovery).toBeNull();
    // Nothing keeps retrying, arming timers or logging afterwards (the sweep runs every 30 ms).
    const settled = subject.bots?.journal(roomId).length;
    await pause(300);
    expect(subject.bots?.journal(roomId).length).toBe(settled);
    expect(subject.bots?.armedKey(roomId)).toBeUndefined();
  });

  it('never recovers a task that changed while it was waiting to retry (stale)', async () => {
    refuseEveryTurnChoice();
    const { subject, persistence, roomId, host } = await pausedBotGame([150, 150]);
    subject.bots?.start();
    subject.bots?.notify(roomId);
    await waitFor(() => Promise.resolve((subject.bots?.journal(roomId) ?? []).some((line) => line.includes('refused (2)'))));
    // The room moves on (as if the human's commit got there first): the waiting retry must not touch it.
    await mutateRoom(persistence, roomId, (room: RoomRecord<RoomSnapshot>) => {
      const state: GameState = hydrateGameState(room.gameSnapshot, room.status);
      state.boardState.currentPlayer = { id: host.playerId, hasMoved: false };
      storeGameState(room.gameSnapshot, state, room.status);
    });
    const before = await stored(persistence, roomId);
    await pause(500);
    const after = await stored(persistence, roomId);
    const journal = subject.bots?.journal(roomId) ?? [];
    expect(journal.filter((line) => line.includes(' refused ('))).toHaveLength(2);
    expect(journal.some((line) => line.includes('turn recovery'))).toBe(false);
    expect(after.gameSnapshot.gameState).toEqual(before.gameSnapshot.gameState);
  });

  it('leaves a task the server already has a deadline for to that deadline, with one clear line (BR)', async () => {
    vi.mocked(policy.decideBotAction).mockImplementation((_view, task) => (task.kind === 'OFFER'
      ? {
          task,
          action: { command: 'accept offer', payload: { offerId: '00000000-0000-4000-8000-000000000000' } },
          fallback: { command: 'decline offer', payload: { offerId: '00000000-0000-4000-8000-000000000000' } },
          reason: 'test',
        }
      : null));
    const { subject, persistence, roomId, host, botId } = await pausedBotGame();
    await mutateRoom(persistence, roomId, (room: RoomRecord<RoomSnapshot>) => {
      const state: GameState = hydrateGameState(room.gameSnapshot, room.status);
      state.boardState.currentPlayer = { id: host.playerId, hasMoved: false };
      state.boardState.ownedProps[1] = { id: botId, color: 'blue', houses: 0 } as never;
      storeGameState(room.gameSnapshot, state, room.status);
    });
    okOf(await ack((callback) => host.socket.emit('make offer', {
      recipientPlayerId: botId,
      offered: { cash: 400, propertyIds: [], jailFreeCardIds: [] },
      requested: { cash: 0, propertyIds: [1], jailFreeCardIds: [] },
    }, callback as never)));
    subject.bots?.start();
    subject.bots?.notify(roomId);
    await waitFor(() => Promise.resolve((subject.bots?.journal(roomId) ?? []).some((line) => line.includes('resolves it at its deadline'))));
    const journal = subject.bots?.journal(roomId) ?? [];
    expect(journal.filter((line) => line.includes(' refused ('))).toHaveLength(4);
    expect(journal.filter((line) => line.includes('cannot answer OFFER; the server resolves it at its deadline'))).toHaveLength(1);
    // The offer is still open for its own expiry, and the bot stops trying.
    expect(await subject.runtime.persistence.tradeOffers.listPendingForRoom(roomId)).toHaveLength(1);
    const settled = journal.length;
    await pause(300);
    expect(subject.bots?.journal(roomId).length).toBe(settled);
  });
});

describe('bot information boundary', () => {
  it('sees the public projection every client gets plus only its own private projection', async () => {
    const { subject, persistence, roomId, botId } = await pausedBotGame();
    const room = await stored(persistence, roomId);
    const [view] = buildBotViews(room, subject.runtime.connections, [], new Date());
    expect(view.botId).toBe(botId);
    expect(view.room).toEqual(projectPublicRoomState(room, subject.runtime.connections));
    expect(view.self).toEqual(projectPrivatePlayerState(room, botId));
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('drawPile');
    for (const cardId of room.gameSnapshot.gameState.privateState.decks.chance.drawPile.slice(0, 3)) {
      expect(serialized).not.toContain(`"${cardId}"`);
    }
  });
});
