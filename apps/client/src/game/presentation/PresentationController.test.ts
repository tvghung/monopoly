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
});
