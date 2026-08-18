import { describe, expect, it, vi } from 'vitest';
import type { LandTilePresentationEvent, MoveCharacterPresentationEvent } from '../events/types';
import type { AnimationExecutionContext, PresentationExecutor } from '../queue/types';
import { createBasicExecutors } from './basicExecutors';
import { createMovementExecutor } from './movementExecutor';
import { PresentationStore } from '../store/presentationStore';
import { makeRoom } from '../testFixtures';

const immediateContext: AnimationExecutionContext = {
  signal: new AbortController().signal,
  speedMultiplier: 1,
  reducedMotion: false,
  getDuration: duration => duration,
  wait: () => Promise.resolve(),
};

function walkEvent(overrides: Partial<MoveCharacterPresentationEvent> = {}): MoveCharacterPresentationEvent {
  return {
    id: 'move',
    roomId: 'room-1',
    roomVersion: 2,
    type: 'MOVE_CHARACTER',
    entityId: 'player-a',
    playerId: 'player-a',
    from: 0,
    to: 4,
    steps: 4,
    presentation: 'WALK',
    ...overrides,
  };
}

function traceStore(store: PresentationStore, trace: string[]): void {
  const start = store.startDisplayPosition.bind(store);
  const settle = store.settleDisplayPosition.bind(store);
  const impact = store.emitTileImpact.bind(store);
  vi.spyOn(store, 'startDisplayPosition').mockImplementation((playerId, tileId) => {
    trace.push(`start:${tileId}`);
    start(playerId, tileId);
  });
  vi.spyOn(store, 'settleDisplayPosition').mockImplementation((playerId, tileId) => {
    trace.push(`settle:${tileId}`);
    settle(playerId, tileId);
  });
  vi.spyOn(store, 'emitTileImpact').mockImplementation((playerId, tileId, kind) => {
    trace.push(`impact:${kind}:${tileId}`);
    impact(playerId, tileId, kind);
  });
}

describe('movement tile impact presentation', () => {
  it('starts a one-step hop before waiting, settles on arrival, and leaves the destination for LAND', async () => {
    const store = new PresentationStore();
    const trace: string[] = [];
    store.resetFromSnapshot(makeRoom());
    traceStore(store, trace);
    const context: AnimationExecutionContext = {
      ...immediateContext,
      wait: duration => { trace.push(`wait:${duration}`); return Promise.resolve(); },
    };

    await createMovementExecutor(store).run(walkEvent({ to: 1, steps: 1 }), context);

    expect(trace).toEqual(['start:1', 'wait:180', 'settle:1']);
    expect(store.getSnapshot().displayPositions['player-a']).toBe(1);
    expect(store.getSnapshot().settledPositions['player-a']).toBe(1);
    expect(store.getSnapshot().tileImpacts).toEqual([]);
  });

  it('orders multi-step arrivals and does not emit a duplicate final STEP before LAND', async () => {
    const store = new PresentationStore();
    const trace: string[] = [];
    store.resetFromSnapshot(makeRoom());
    traceStore(store, trace);
    const context: AnimationExecutionContext = {
      ...immediateContext,
      wait: duration => { trace.push(`wait:${duration}`); return Promise.resolve(); },
    };
    const movement = createMovementExecutor(store);
    const event = walkEvent();

    await movement.run(event, context);
    const landingExecutor = createBasicExecutors(store).LAND_TILE as unknown as PresentationExecutor<LandTilePresentationEvent>;
    await landingExecutor.run({
      id: 'land',
      roomId: 'room-1',
      roomVersion: 2,
      type: 'LAND_TILE',
      entityId: 'player-a',
      playerId: 'player-a',
      tileId: 4,
    }, context);

    expect(trace).toEqual([
      'start:1', 'wait:180', 'settle:1', 'impact:STEP:1',
      'start:2', 'wait:180', 'settle:2', 'impact:STEP:2',
      'start:3', 'wait:180', 'settle:3', 'impact:STEP:3',
      'start:4', 'wait:180', 'settle:4', 'impact:LAND:4', 'wait:120',
    ]);
    expect(store.getSnapshot().tileImpacts.map(impact => [impact.tileId, impact.kind])).toEqual([
      [1, 'STEP'], [2, 'STEP'], [3, 'STEP'], [4, 'LAND'],
    ]);
  });

  it('walks across the 39 to 0 boundary in the same publication-before-wait order', async () => {
    const store = new PresentationStore();
    const trace: string[] = [];
    store.resetFromSnapshot(makeRoom());
    traceStore(store, trace);
    await createMovementExecutor(store).run(walkEvent({ from: 39, to: 0, steps: 1 }), {
      ...immediateContext,
      wait: duration => { trace.push(`wait:${duration}`); return Promise.resolve(); },
    });

    expect(trace).toEqual(['start:0', 'wait:180', 'settle:0']);
  });

  it('snaps both target and settled positions without impacts for reduced motion', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());

    await createMovementExecutor(store).run(walkEvent(), { ...immediateContext, reducedMotion: true });

    expect(store.getSnapshot().displayPositions['player-a']).toBe(4);
    expect(store.getSnapshot().settledPositions['player-a']).toBe(4);
    expect(store.getSnapshot().tileImpacts).toEqual([]);
  });
});
