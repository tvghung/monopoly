import { describe, expect, it } from 'vitest';
import type { LandTilePresentationEvent, MoveCharacterPresentationEvent } from '../events/types';
import type { PresentationExecutor } from '../queue/types';
import type { AnimationExecutionContext } from '../queue/types';
import { createMovementExecutor } from './movementExecutor';
import { createBasicExecutors } from './basicExecutors';
import { PresentationStore } from '../store/presentationStore';
import { makeRoom } from '../testFixtures';

const immediateContext: AnimationExecutionContext = {
  signal: new AbortController().signal,
  speedMultiplier: 1,
  reducedMotion: false,
  getDuration: duration => duration,
  wait: async () => {},
};

describe('movement tile impact presentation', () => {
  it('emits one light impact for every displayed walk step', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const event: MoveCharacterPresentationEvent = {
      id: 'move', roomId: 'room-1', roomVersion: 2, type: 'MOVE_CHARACTER', entityId: 'player-a',
      playerId: 'player-a', from: 0, to: 4, steps: 4, presentation: 'WALK',
    };

    await createMovementExecutor(store).run(event, immediateContext);
    createMovementExecutor(store).finish(event, immediateContext);

    expect(store.getSnapshot().displayPositions['player-a']).toBe(4);
    expect(store.getSnapshot().tileImpacts.map(impact => [impact.tileId, impact.kind])).toEqual([
      [1, 'STEP'], [2, 'STEP'], [3, 'STEP'], [4, 'STEP'],
    ]);
  });

  it('suppresses step impacts when reduced motion snaps the token', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const event: MoveCharacterPresentationEvent = {
      id: 'move', roomId: 'room-1', roomVersion: 2, type: 'MOVE_CHARACTER', entityId: 'player-a',
      playerId: 'player-a', from: 0, to: 4, steps: 4, presentation: 'WALK',
    };
    await createMovementExecutor(store).run(event, { ...immediateContext, reducedMotion: true });
    expect(store.getSnapshot().displayPositions['player-a']).toBe(4);
    expect(store.getSnapshot().tileImpacts).toEqual([]);
  });

  it('publishes one deeper landing signal after the movement step sequence', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const landingExecutor = createBasicExecutors(store).LAND_TILE as unknown as PresentationExecutor<LandTilePresentationEvent>;
    await landingExecutor.run({
      id: 'land', roomId: 'room-1', roomVersion: 2, type: 'LAND_TILE', entityId: 'player-a',
      playerId: 'player-a', tileId: 4,
    }, immediateContext);
    expect(store.getSnapshot().tileImpacts).toHaveLength(1);
    expect(store.getSnapshot().tileImpacts[0]).toMatchObject({ tileId: 4, kind: 'LAND' });
  });
});
