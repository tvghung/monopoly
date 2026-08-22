import { describe, expect, it } from 'vitest';
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
    expect(controller.getState().activeBoardEvent).toBeNull();
    expect(controller.getState().moneyTransfers).toEqual([]);
    expect(controller.queue.getStatus()).toBe('idle');
    controller.dispose();
  });
});
