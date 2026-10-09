import type { GameplaySemanticEvent, PublicRoomState } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import { buildBoardRenderModel } from '../scene/board/boardRenderModel';
import { PresentationController } from './PresentationController';
import { cloneRoom, makeRoom } from './testFixtures';

/** The player rolls 1 + 2 and walks from Xuất Phát to tile 3. */
function rolled(previous: PublicRoomState): PublicRoomState {
  const next = cloneRoom(previous);
  next.gameState.boardState.diceValue = { dice1: 1, dice2: 2 };
  next.gameState.boardState.rollSequence = previous.gameState.boardState.rollSequence + 1;
  next.gameState.players['player-a'].currentTile = 3;
  next.gameState.boardState.currentPlayer = { id: 'player-a', hasMoved: true };
  return next;
}

/** The purchase of tile 3 by `buyer` (from the Bank, or from `seller`), committed as its own update. */
function transferred(previous: PublicRoomState, buyer: string, seller: string | null = null): PublicRoomState {
  const next = cloneRoom(previous);
  const sequence = previous.gameState.boardState.gameplayEvents.sequence + 1;
  next.gameState.boardState.ownedProps[3] = { id: buyer, color: 'red', houses: 0 };
  const event: GameplaySemanticEvent = {
    eventId: `transfer-${String(sequence)}`,
    sequence,
    operationId: `operation-${String(sequence)}`,
    type: 'PROPERTY_TRANSFER',
    tileID: 3,
    from: seller ? { kind: 'PLAYER', playerId: seller } : { kind: 'BANK' },
    to: { kind: 'PLAYER', playerId: buyer },
    cause: seller ? 'TRADE' : 'BANK_PURCHASE',
  } as GameplaySemanticEvent;
  next.gameState.boardState.gameplayEvents = {
    sequence,
    events: [...previous.gameState.boardState.gameplayEvents.events, event],
  };
  return next;
}

const boardOwner = (controller: PresentationController, room: PublicRoomState) => (
  buildBoardRenderModel(room.gameState, controller.getState()).tiles[3]?.ownerId
);

describe('ownership hold (BA: a flag rises only after the dice and the walk)', () => {
  it.each([
    ['normal motion', false],
    ['reduced motion', true],
  ] as const)('keeps the new owner off the board until the queue reaches the purchase (%s)', async (_label, reducedMotion) => {
    const controller = new PresentationController(reducedMotion, 2);
    const initial = makeRoom();
    controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');
    const order: string[] = [];
    controller.store.subscribe(() => {
      const state = controller.getState();
      if (state.characterLandings.length > 0 && !order.includes('landed')) order.push('landed');
      if (state.displayPositions['player-a'] === 3 && !order.includes('walked')) order.push('walked');
      if (state.ownershipChanges.length > 0 && !order.includes('flag')) order.push('flag');
    });

    // The bot's roll and its purchase arrive back to back, long before a client finishes animating the roll.
    const afterRoll = rolled(initial);
    const afterPurchase = transferred(afterRoll, 'player-a');
    controller.acceptRoomSnapshot(afterRoll, 'LIVE_UPDATE');
    controller.acceptRoomSnapshot(afterPurchase, 'LIVE_UPDATE');

    expect(controller.getState().displayOwnership).toEqual({ 3: null });
    expect(boardOwner(controller, afterPurchase)).toBeUndefined();

    await controller.queue.whenIdle();
    expect(order.indexOf('flag')).toBeGreaterThan(order.indexOf('walked'));
    if (!reducedMotion) expect(order.indexOf('flag')).toBeGreaterThan(order.indexOf('landed'));
    expect(controller.getState().displayOwnership).toEqual({});
    expect(boardOwner(controller, afterPurchase)).toBe('player-a');
    controller.dispose();
  });

  it('holds nothing when the purchase is declined', () => {
    const controller = new PresentationController();
    const initial = makeRoom();
    controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');
    controller.queue.pause();
    controller.acceptRoomSnapshot(rolled(initial), 'LIVE_UPDATE');
    expect(controller.getState().displayOwnership).toEqual({});
    expect(controller.getState().ownershipChanges).toEqual([]);
    controller.dispose();
  });

  it('shows each owner of a tile that changes hands twice in turn, then the authoritative one', async () => {
    const controller = new PresentationController(false, 2);
    const initial = makeRoom();
    controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');
    const bought = transferred(rolled(initial), 'player-a');
    const traded = transferred(bought, 'player-b', 'player-a');
    controller.queue.pause();
    controller.acceptRoomSnapshot(rolled(initial), 'LIVE_UPDATE');
    controller.acceptRoomSnapshot(bought, 'LIVE_UPDATE');
    controller.acceptRoomSnapshot(traded, 'LIVE_UPDATE');
    expect(controller.getState().displayOwnership).toEqual({ 3: null });
    const seen: Array<string | null | undefined> = [];
    controller.store.subscribe(() => {
      const owner = boardOwner(controller, traded) ?? null;
      if (seen.at(-1) !== owner) seen.push(owner);
    });
    controller.queue.resume();
    await controller.queue.whenIdle();
    expect(seen).toEqual([null, 'player-a', 'player-b']);
    expect(controller.getState().displayOwnership).toEqual({});
    controller.dispose();
  });

  it('never leaves a stale flag: a reconnect sync or a skip shows the authoritative owner at once', async () => {
    for (const interrupt of ['sync', 'skip'] as const) {
      const controller = new PresentationController();
      const initial = makeRoom();
      controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');
      const afterPurchase = transferred(rolled(initial), 'player-a');
      controller.queue.pause();
      controller.acceptRoomSnapshot(rolled(initial), 'LIVE_UPDATE');
      controller.acceptRoomSnapshot(afterPurchase, 'LIVE_UPDATE');
      expect(boardOwner(controller, afterPurchase)).toBeUndefined();
      if (interrupt === 'sync') controller.acceptRoomSnapshot(cloneRoom(afterPurchase), 'SESSION_SYNC');
      else controller.skipAllAndSnap();
      controller.queue.resume();
      await controller.queue.whenIdle();
      expect(controller.getState().displayOwnership).toEqual({});
      expect(boardOwner(controller, afterPurchase)).toBe('player-a');
      controller.dispose();
    }
  });
});
