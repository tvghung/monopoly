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

  it('hard-snaps on reconnect and stale movement completion cannot overwrite the authoritative tile', async () => {
    const controller = new PresentationController();
    const initial = makeRoom();
    controller.acceptRoomSnapshot(initial, 'SESSION_SYNC');
    const live = cloneRoom(initial);
    live.gameState.players['player-a'].currentTile = 4;
    controller.acceptRoomSnapshot(live, 'LIVE_UPDATE');
    expect(controller.getState().displayPositions['player-a']).toBe(1);
    expect(controller.getState().settledPositions['player-a']).toBe(0);
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
});
