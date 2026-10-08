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

async function pausedBotGame() {
  const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
  const subject = await startServer(persistence, { bots: { delayScale: 0, sweepIntervalMs: 30 } });
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

  it('parks a task whose fallback is refused too, without looping or changing the room', async () => {
    vi.mocked(policy.decideBotAction).mockImplementation((_view, task) => ({
      task,
      action: { command: 'pay bail', payload: undefined },
      fallback: { command: 'use jail card', payload: undefined },
      reason: 'test',
    }));
    const { subject, persistence, roomId } = await pausedBotGame();
    const before = await stored(persistence, roomId);
    subject.bots?.start();
    subject.bots?.notify(roomId);
    await pause(400);
    const after = await stored(persistence, roomId);
    const journal = subject.bots?.journal(roomId) ?? [];
    expect(journal.filter((line) => line.includes(' refused ('))).toHaveLength(2);
    expect(journal.some((line) => line.includes('parked TURN'))).toBe(true);
    expect(subject.bots?.armedKey(roomId)).toBeUndefined();
    expect(after.gameSnapshot.gameState).toEqual(before.gameSnapshot.gameState);
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
