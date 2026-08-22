import { describe, expect, it, vi } from 'vitest';
import { cloneRoom, makeRoom } from './testFixtures';
import { PresentationController } from './PresentationController';

describe('PresentationController', () => {
  it('snaps session sync and queues only live diffs', async () => {
    const controller = new PresentationController();
    const initial = makeRoom();
    controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');
    expect(controller.getState().displayPositions['player-a']).toBe(0);

    const reconnect = cloneRoom(initial);
    reconnect.gameState.players['player-a'].currentTile = 4;
    controller.acceptRoomSnapshot(reconnect, 'SESSION_SYNC');
    await controller.queue.whenIdle();
    expect(controller.getState().displayPositions['player-a']).toBe(4);
    expect(controller.queue.getStatus()).toBe('idle');

    const live = cloneRoom(reconnect);
    live.gameState.players['player-a'].currentTile = 7;
    controller.acceptRoomSnapshot(live, 'LIVE_UPDATE');
    await controller.queue.whenIdle();
    expect(controller.getState().displayPositions['player-a']).toBe(7);
    controller.dispose();
  });

  it('snaps to the newest accepted snapshot when reduced motion interrupts queued work', async () => {
    const controller = new PresentationController();
    const initial = makeRoom();
    controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');

    const versionTwo = cloneRoom(initial);
    versionTwo.gameState.players['player-a'].currentTile = 8;
    controller.acceptRoomSnapshot(versionTwo, 'LIVE_UPDATE');
    const versionThree = cloneRoom(versionTwo);
    versionThree.gameState.players['player-a'].currentTile = 12;
    versionThree.gameState.boardState.diceValue = { dice1: 5, dice2: 6 };
    controller.acceptRoomSnapshot(versionThree, 'LIVE_UPDATE');

    controller.setPreferences(true, 1);
    await controller.queue.whenIdle();

    expect(controller.getState().displayPositions['player-a']).toBe(12);
    expect(controller.getState().displayDice).toEqual({ dice1: 5, dice2: 6 });
    expect(controller.getState().status).toBe('idle');
    controller.dispose();
  });

  it('skipAllAndSnap cancels multiple queued events at the latest accepted state', async () => {
    const controller = new PresentationController();
    const initial = makeRoom();
    controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');
    const latest = cloneRoom(initial);
    latest.gameState.players['player-a'].currentTile = 16;
    latest.gameState.players['player-b'].currentTile = 19;
    latest.gameState.boardState.currentPlayer = { id: 'player-b', hasMoved: false };
    controller.acceptRoomSnapshot(latest, 'LIVE_UPDATE');

    controller.skipAllAndSnap();
    await controller.queue.whenIdle();

    expect(controller.getState().displayPositions).toMatchObject({ 'player-a': 16, 'player-b': 19 });
    expect(controller.getState().displayActivePlayerId).toBe('player-b');
    expect(controller.getState().status).toBe('idle');
    controller.dispose();
  });

  it('hard-snaps on reconnect while an identified dice presentation is active', async () => {
    const controller = new PresentationController();
    const initial = makeRoom();
    controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');
    const live = cloneRoom(initial);
    live.gameState.players['player-a'].currentTile = 4;
    live.gameState.boardState.diceValue = { dice1: 2, dice2: 2 };
    live.gameState.boardState.rollSequence = 1;
    controller.acceptRoomSnapshot(live, 'LIVE_UPDATE');
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(controller.getState().displayPositions['player-a']).toBe(0);
    expect(controller.getState().diceRoll?.rollSequence).toBe(1);
    const reconnect = cloneRoom(live);
    reconnect.gameState.players['player-a'].currentTile = 3;

    controller.acceptRoomSnapshot(reconnect, 'SESSION_SYNC');
    await controller.queue.whenIdle();

    expect(controller.getState().displayPositions['player-a']).toBe(3);
    expect(controller.getState().settledPositions['player-a']).toBe(3);
    expect(controller.getState().tileImpacts).toEqual([]);
    expect(controller.getState().characterMovements).toEqual([]);
    expect(controller.getState().characterLandings).toEqual([]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(controller.getState().displayPositions['player-a']).toBe(3);
    controller.dispose();
  });

  it('cancels active movement when its player leaves and snaps to the authoritative roster', async () => {
    const controller = new PresentationController();
    const initial = makeRoom();
    controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');
    const moving = cloneRoom(initial);
    moving.gameState.boardState.diceValue = { dice1: 3, dice2: 3 };
    moving.gameState.boardState.rollSequence = 1;
    moving.gameState.players['player-a'].currentTile = 6;
    controller.acceptRoomSnapshot(moving, 'LIVE_UPDATE');
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(controller.queue.getStatus()).toBe('playing');

    const left = cloneRoom(moving);
    delete left.gameState.players['player-a'];
    left.gameState.boardState.players = ['player-b'];
    left.gameState.boardState.finishedPlayers['player-a'] = {
      name: 'An', color: 'red', characterId: 'dog', reason: 'LEFT', accountBalance: 1_500,
    };
    controller.acceptRoomSnapshot(left, 'LIVE_UPDATE');
    await controller.queue.whenIdle();

    expect(controller.getState().displayPositions['player-a']).toBeUndefined();
    expect(controller.getState().displayPositions['player-b']).toBe(5);
    expect(controller.getState().characterMovements).toEqual([]);
    controller.dispose();
  });

  it('snaps an unexpected roll-sequence gap to the current authoritative dice', () => {
    const controller = new PresentationController();
    const initial = makeRoom();
    controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');
    const gap = cloneRoom(initial);
    gap.gameState.boardState.diceValue = { dice1: 5, dice2: 6 };
    gap.gameState.boardState.rollSequence = 2;
    gap.gameState.players['player-a'].currentTile = 11;

    controller.acceptRoomSnapshot(gap, 'LIVE_UPDATE');

    expect(controller.getState().displayDice).toEqual({ dice1: 5, dice2: 6 });
    expect(controller.getState().displayRollSequence).toBe(2);
    expect(controller.getState().displayPositions['player-a']).toBe(11);
    expect(controller.queue.getStatus()).toBe('idle');
    controller.dispose();
  });

  it('snaps without fabricating transfers when the semantic sequence tail has a gap', () => {
    const controller = new PresentationController();
    const initial = makeRoom();
    controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');
    const gap = cloneRoom(initial);
    gap.gameState.players['player-a'].currentTile = 9;
    gap.gameState.players['player-a'].accountBalance = 900;
    gap.gameState.boardState.gameplayEvents = {
      sequence: 3,
      events: [{
        eventId: '00000000-0000-4000-8000-000000000003',
        sequence: 3,
        type: 'JAIL_ROLL_FAILED',
        playerId: 'player-a',
      }],
    };

    controller.acceptRoomSnapshot(gap, 'LIVE_UPDATE');

    expect(controller.getState().displayPositions['player-a']).toBe(9);
    expect(controller.getState().displayLogs).toEqual([]);
    expect(controller.getState().moneyTransfers).toEqual([]);
    expect(controller.queue.getStatus()).toBe('idle');
    controller.dispose();
  });

  it('buffers a roll log while dice and movement presentation is active', () => {
    const controller = new PresentationController();
    const initial = makeRoom();
    initial.gameState.boardState.logs = ['Lịch sử cũ'];
    controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');
    const roll = cloneRoom(initial);
    roll.gameState.boardState.diceValue = { dice1: 3, dice2: 4 };
    roll.gameState.boardState.rollSequence = 1;
    roll.gameState.boardState.currentPlayer.hasMoved = true;
    roll.gameState.players['player-a'].currentTile = 7;
    roll.gameState.turnInfo.pendingCardInteraction = {
      operationId: 'roll-log-card',
      playerId: 'player-a',
      turnNumber: 1,
      deck: 'chance',
      sourceTile: 7,
      stage: 'AWAITING_DRAW',
      continuation: { playerId: 'player-a', turnNumber: 1 },
      deadlineAt: '2026-08-22T00:00:30.000Z',
    };
    roll.gameState.boardState.logs = ['Lịch sử cũ', 'An đổ được 7'];

    controller.acceptRoomSnapshot(roll, 'LIVE_UPDATE');

    expect(controller.getState().displayLogs).toEqual(['Lịch sử cũ']);
    controller.dispose();
  });

  it('keeps purchase/card logs gated through a pending interaction and flushes at handoff', async () => {
    const controller = new PresentationController();
    controller.setPreferences(true, 1);
    const initial = makeRoom();
    controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');
    const purchase = cloneRoom(initial);
    purchase.gameState.boardState.currentPlayer.hasMoved = true;
    purchase.gameState.players['player-a'].currentTile = 1;
    purchase.gameState.players['player-a'].accountBalance = 1440;
    purchase.gameState.turnInfo.pendingLandingDecision = {
      kind: 'PURCHASE', operationId: 'purchase-log', playerId: 'player-a', tileID: 1, price: 60,
    };
    purchase.gameState.boardState.gameplayEvents = {
      sequence: 1,
      events: [{
        eventId: 'purchase-log-event', sequence: 1, type: 'MONEY_TRANSFER',
        source: { kind: 'PLAYER', playerId: 'player-a' }, destination: { kind: 'BANK' },
        amount: 60, reason: 'PROPERTY_PURCHASE', operationId: 'purchase-log',
      }],
    };
    purchase.gameState.boardState.logs = ['An mua đất'];
    controller.acceptRoomSnapshot(purchase, 'LIVE_UPDATE');
    await controller.queue.whenIdle();
    expect(controller.getState().displayLogs).toEqual([]);

    const handoff = cloneRoom(purchase);
    delete handoff.gameState.turnInfo.pendingLandingDecision;
    handoff.gameState.boardState.currentPlayer = { id: 'player-b', hasMoved: false };
    handoff.gameState.boardState.turnNumber = 2;
    handoff.gameState.boardState.logs = ['An mua đất', 'Đến lượt Bình'];
    controller.acceptRoomSnapshot(handoff, 'LIVE_UPDATE');
    await controller.queue.whenIdle();
    expect(controller.getState().displayLogs).toEqual(['An mua đất', 'Đến lượt Bình']);

    const card = cloneRoom(handoff);
    card.gameState.boardState.currentPlayer = { id: 'player-a', hasMoved: true };
    card.gameState.boardState.turnNumber = 3;
    card.gameState.players['player-a'].currentTile = 2;
    card.gameState.turnInfo.pendingCardInteraction = {
      operationId: 'card-log', playerId: 'player-a', turnNumber: 3, deck: 'chest', sourceTile: 2,
      stage: 'AWAITING_DRAW', continuation: { playerId: 'player-a', turnNumber: 3 },
      deadlineAt: '2026-08-22T00:00:30.000Z',
    };
    card.gameState.boardState.logs = ['An mua đất', 'Đến lượt Bình', 'An rút thẻ'];
    controller.acceptRoomSnapshot(card, 'LIVE_UPDATE');
    await controller.queue.whenIdle();
    expect(controller.getState().displayLogs).toEqual(['An mua đất', 'Đến lượt Bình']);
    controller.dispose();
    vi.restoreAllMocks();
  });

  it('hydrates active card state on session sync without replaying flight or reveal', () => {
    const controller = new PresentationController();
    const initial = makeRoom();
    const sync = cloneRoom(initial);
    sync.gameState.players['player-a'].currentTile = 7;
    sync.gameState.turnInfo.pendingCardInteraction = {
      operationId: 'reconnect-card', playerId: 'player-a', turnNumber: 1, deck: 'chance', sourceTile: 7,
      stage: 'REVEALED', revealedCardId: 'chance-dividend',
      continuation: { playerId: 'player-a', turnNumber: 1 }, deadlineAt: '2026-08-22T00:00:30.000Z',
    };
    controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');
    controller.acceptRoomSnapshot(sync, 'SESSION_SYNC');
    expect(controller.getState().cardPresentation).toEqual({
      operationId: 'reconnect-card', playerId: 'player-a', deck: 'chance', sourceTile: 7,
      stage: 'REVEALED', revealedCardId: 'chance-dividend', durationMs: 0,
    });
    expect(controller.getState().characterMovements).toEqual([]);
    controller.dispose();
  });
});
