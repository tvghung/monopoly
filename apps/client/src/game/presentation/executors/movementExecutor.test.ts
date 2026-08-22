import { describe, expect, it, vi } from 'vitest';
import type { LandTilePresentationEvent, MoveCharacterPresentationEvent } from '../events/types';
import type { AnimationExecutionContext, PresentationExecutor } from '../queue/types';
import { createBasicExecutors } from './basicExecutors';
import { createMovementExecutor } from './movementExecutor';
import { PresentationStore } from '../store/presentationStore';
import { makeRoom } from '../testFixtures';
import { presentationTiming } from '../timings';

const immediateContext: AnimationExecutionContext = {
  signal: new AbortController().signal,
  speedMultiplier: 1,
  reducedMotion: false,
  getDuration: duration => duration,
  wait: () => Promise.resolve(),
  waitForDuration: () => Promise.resolve(),
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
  const start = store.startCharacterHop.bind(store);
  const complete = store.completeCharacterHop.bind(store);
  const impact = store.emitTileImpact.bind(store);
  const landing = store.emitCharacterLanding.bind(store);
  vi.spyOn(store, 'startCharacterHop').mockImplementation((playerId, fromTileId, toTileId, durationMs) => {
    trace.push(`start:${fromTileId}->${toTileId}:${durationMs}`);
    start(playerId, fromTileId, toTileId, durationMs);
  });
  vi.spyOn(store, 'completeCharacterHop').mockImplementation((playerId, tileId) => {
    trace.push(`complete:${tileId}`);
    complete(playerId, tileId);
  });
  vi.spyOn(store, 'emitTileImpact').mockImplementation((playerId, tileId, kind, timing) => {
    trace.push(`impact:${kind}:${tileId}:${timing.delayMs}/${timing.depressDurationMs}/${timing.reboundDurationMs}`);
    impact(playerId, tileId, kind, timing);
  });
  vi.spyOn(store, 'emitCharacterLanding').mockImplementation((playerId, tileId, durationMs) => {
    trace.push(`landing:${tileId}:${durationMs}`);
    landing(playerId, tileId, durationMs);
  });
}

describe('movement tile-hop presentation', () => {
  it('publishes a logical hop before waiting and completes it at the exact destination', async () => {
    const store = new PresentationStore();
    const trace: string[] = [];
    store.resetFromSnapshot(makeRoom());
    traceStore(store, trace);
    const context: AnimationExecutionContext = {
      ...immediateContext,
      waitForDuration: duration => { trace.push(`wait:${duration}`); return Promise.resolve(); },
    };

    await createMovementExecutor(store).run(walkEvent({ to: 1, steps: 1 }), context);

    expect(trace).toEqual([
      'start:0->1:180',
      'wait:180',
      'complete:1',
    ]);
    expect(store.getSnapshot().displayPositions['player-a']).toBe(1);
    expect(store.getSnapshot().settledPositions['player-a']).toBe(1);
    expect(store.getSnapshot().characterMovements.map(signal => [
      signal.transition,
      signal.phase,
      signal.fromTileId,
      signal.toTileId,
      signal.durationMs,
    ])).toEqual([
      ['TILE_HOP', 'START', 0, 1, 180],
      ['TILE_HOP', 'COMPLETE', 0, 1, 180],
    ]);
  });

  it('orders multi-step arrivals and leaves the destination for one separate LAND signal', async () => {
    const store = new PresentationStore();
    const trace: string[] = [];
    store.resetFromSnapshot(makeRoom());
    traceStore(store, trace);
    const context: AnimationExecutionContext = {
      ...immediateContext,
      waitForDuration: duration => { trace.push(`wait:${duration}`); return Promise.resolve(); },
    };

    await createMovementExecutor(store).run(walkEvent(), context);

    expect(trace).toEqual([
      'start:0->1:180', 'impact:STEP:1:144/36/78', 'wait:180', 'complete:1',
      'start:1->2:180', 'impact:STEP:2:144/36/78', 'wait:180', 'complete:2',
      'start:2->3:180', 'impact:STEP:3:144/36/78', 'wait:180', 'complete:3',
      'start:3->4:180', 'wait:180', 'complete:4',
    ]);
    expect(store.getSnapshot().tileImpacts).toEqual([
      {
        sequence: 1,
        playerId: 'player-a',
        tileId: 1,
        kind: 'STEP',
        delayMs: 144,
        depressDurationMs: 36,
        reboundDurationMs: 78,
      },
      {
        sequence: 2,
        playerId: 'player-a',
        tileId: 2,
        kind: 'STEP',
        delayMs: 144,
        depressDurationMs: 36,
        reboundDurationMs: 78,
      },
      {
        sequence: 3,
        playerId: 'player-a',
        tileId: 3,
        kind: 'STEP',
        delayMs: 144,
        depressDurationMs: 36,
        reboundDurationMs: 78,
      },
    ]);

    const landing = {
      id: 'land',
      roomId: 'room-1',
      roomVersion: 2,
      type: 'LAND_TILE' as const,
      entityId: 'player-a',
      playerId: 'player-a',
      tileId: 4,
    };
    const basicContext: AnimationExecutionContext = {
      ...context,
      waitForDuration: duration => { trace.push(`wait:${duration}`); return Promise.resolve(); },
    };
    const landingExecutor = createBasicExecutors(store).LAND_TILE as unknown as PresentationExecutor<LandTilePresentationEvent>;
    await landingExecutor.run(landing, basicContext);

    expect(trace.at(-3)).toBe('impact:LAND:4:0/52/68');
    expect(trace.at(-2)).toBe('landing:4:120');
    expect(trace.at(-1)).toBe('wait:120');
    expect(store.getSnapshot().characterReactions).toEqual([]);
    expect(store.getSnapshot().tileImpacts.at(-1)).toMatchObject({
      tileId: 4,
      kind: 'LAND',
      delayMs: 0,
      depressDurationMs: 52,
      reboundDurationMs: 68,
    });
  });

  it.each([
    [1, 0, 1],
    [4, 0, 4],
    [12, 0, 12],
    [3, 9, 12],
    [3, 19, 22],
    [3, 29, 32],
    [3, 39, 2],
  ])('publishes every logical segment for %i steps from %i to %i', async (steps, from, to) => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    await createMovementExecutor(store).run(walkEvent({ from, to, steps }), immediateContext);

    const starts = store.getSnapshot().characterMovements
      .filter(signal => signal.phase === 'START');
    expect(starts).toHaveLength(steps);
    expect(starts.map(signal => [signal.fromTileId, signal.toTileId])).toEqual(
      Array.from({ length: steps }, (_, index) => {
        const source = (from + index) % 40;
        return [source, (source + 1) % 40];
      }),
    );
    expect(store.getSnapshot().tileImpacts.map(impact => impact.tileId)).toEqual(
      Array.from({ length: Math.max(0, steps - 1) }, (_, index) => (from + index + 1) % 40),
    );
  });

  it('keeps the 39 to 0 segment explicit', async () => {
    const store = new PresentationStore();
    const trace: string[] = [];
    store.resetFromSnapshot(makeRoom());
    traceStore(store, trace);
    await createMovementExecutor(store).run(walkEvent({
      from: 39,
      to: 0,
      steps: 1,
      passGo: {
        eventId: 'move:go',
        sequence: 1,
        type: 'PASS_GO',
        playerId: 'player-a',
        reward: 200,
        fromTile: 39,
        destinationTile: 0,
        movement: { kind: 'DICE_WALK', rollSequence: 1 },
      },
    }), {
      ...immediateContext,
      waitForDuration: duration => { trace.push(`wait:${duration}`); return Promise.resolve(); },
    });

    expect(trace).toEqual([
      'start:39->0:180',
      'wait:180',
      'complete:0',
      `wait:${presentationTiming.goMoment}`,
      `wait:${presentationTiming.goHold}`,
    ]);
    expect(store.getSnapshot().characterMovements[0]).toMatchObject({ fromTileId: 39, toTileId: 0 });
    expect(store.getSnapshot().goCrossings).toMatchObject([{
      id: 'move:go', playerId: 'player-a', fromTileId: 39, toTileId: 0,
    }]);
  });

  it('holds at GO only for the physical checkpoint and coin feedback', async () => {
    const store = new PresentationStore();
    const trace: string[] = [];
    store.resetFromSnapshot(makeRoom());
    traceStore(store, trace);

    await createMovementExecutor(store).run(walkEvent({
      from: 39,
      to: 1,
      steps: 2,
      passGo: {
        eventId: 'move:go-overlap',
        sequence: 1,
        type: 'PASS_GO',
        playerId: 'player-a',
        reward: 200,
        fromTile: 39,
        destinationTile: 1,
        movement: { kind: 'DICE_WALK', rollSequence: 1 },
      },
    }), {
      ...immediateContext,
      waitForDuration: duration => { trace.push(`physical:${duration}`); return Promise.resolve(); },
    });

    expect(trace).toEqual([
      'start:39->0:180',
      'impact:STEP:0:144/36/78',
      'physical:180',
      'complete:0',
      `physical:${presentationTiming.goMoment}`,
      `physical:${presentationTiming.goHold}`,
      'start:0->1:180',
      'physical:180',
      'complete:1',
    ]);
  });

  it('does not publish GO feedback for SNAP movement', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());

    await createMovementExecutor(store).run(walkEvent({
      from: 39, to: 0, steps: 1, presentation: 'SNAP',
    }), immediateContext);

    expect(store.getSnapshot().goCrossings).toEqual([]);
  });

  it('keeps the GO semantic cue when a proven WALK is reduced-motion snapped', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());

    await createMovementExecutor(store).run(walkEvent({
      from: 39,
      to: 0,
      steps: 1,
      passGo: {
        eventId: 'move:go',
        sequence: 1,
        type: 'PASS_GO',
        playerId: 'player-a',
        reward: 200,
        fromTile: 39,
        destinationTile: 0,
        movement: { kind: 'DICE_WALK', rollSequence: 1 },
      },
    }), { ...immediateContext, reducedMotion: true });

    expect(store.getSnapshot().goCrossings).toMatchObject([{
      id: 'move:go', playerId: 'player-a', fromTileId: 39, toTileId: 0,
    }]);
  });

  it('does not write movement state after its execution becomes stale', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());

    await createMovementExecutor(store).run(walkEvent(), {
      ...immediateContext,
      isCurrent: () => false,
    });

    expect(store.getSnapshot().characterMovements).toEqual([]);
    expect(store.getSnapshot().goCrossings).toEqual([]);
  });

  it.each([
    [0.75, 240, 48],
    [1, 180, 36],
    [1.5, 120, 24],
    [2, 90, 18],
  ])('uses one resolved duration for queue wait and rendered hop at %sx', async (speed, expectedDuration) => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const waits: number[] = [];
    await createMovementExecutor(store).run(walkEvent({ to: 1, steps: 1 }), {
      ...immediateContext,
      speedMultiplier: speed,
      getDuration: duration => duration / speed,
      waitForDuration: duration => { waits.push(duration); return Promise.resolve(); },
    });

    expect(waits).toEqual([expectedDuration]);
    expect(store.getSnapshot().characterMovements[0]?.durationMs).toBe(expectedDuration);
  });

  it.each([
    [0.75, 240, 48],
    [1, 180, 36],
    [1.5, 120, 24],
    [2, 90, 18],
  ])('begins intermediate STEP during the final contact phase at %sx', async (speed, expectedHop, expectedDepress) => {
    const store = new PresentationStore();
    const trace: string[] = [];
    store.resetFromSnapshot(makeRoom());
    traceStore(store, trace);
    await createMovementExecutor(store).run(walkEvent({ to: 2, steps: 2 }), {
      ...immediateContext,
      speedMultiplier: speed,
      getDuration: duration => duration / speed,
      waitForDuration: duration => { trace.push(`wait:${duration}`); return Promise.resolve(); },
    });

    expect(trace[0]).toBe(`start:0->1:${expectedHop}`);
    const impactParts = trace[1].split(':');
    const timingParts = impactParts[3]?.split('/') ?? [];
    expect(impactParts.slice(0, 3)).toEqual(['impact', 'STEP', '1']);
    expect(Number(timingParts[0])).toBeCloseTo(expectedHop - expectedDepress);
    expect(Number(timingParts[1])).toBeCloseTo(expectedDepress);
    expect(Number(timingParts[2])).toBeCloseTo(presentationTiming.tileImpact.stepRebound / speed);
    expect(Number(trace[2].slice('wait:'.length))).toBeCloseTo(expectedHop);
    expect(trace[3]).toBe('complete:1');
    expect(trace[4]).toBe(`start:1->2:${expectedHop}`);
  });

  it('snaps both target and settled positions without impacts for reduced motion', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());

    await createMovementExecutor(store).run(walkEvent(), { ...immediateContext, reducedMotion: true });

    expect(store.getSnapshot().displayPositions['player-a']).toBe(4);
    expect(store.getSnapshot().settledPositions['player-a']).toBe(4);
    expect(store.getSnapshot().tileImpacts).toEqual([]);
    expect(store.getSnapshot().characterMovements.at(-1)).toMatchObject({
      transition: 'SNAP',
      toTileId: 4,
      durationMs: 0,
    });
  });

  it('keeps a destination preview only for a proven WALK until LAND clears it', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    await createMovementExecutor(store).run(walkEvent({ to: 3, steps: 3 }), immediateContext);
    expect(store.getSnapshot().destinationPreview).toMatchObject({
      playerId: 'player-a',
      tileId: 3,
      strongDurationMs: presentationTiming.destinationPreviewStrong,
    });

    const landing = createBasicExecutors(store).LAND_TILE as unknown as PresentationExecutor<LandTilePresentationEvent>;
    await landing.run({
      id: 'land-preview',
      roomId: 'room-1',
      roomVersion: 2,
      type: 'LAND_TILE',
      entityId: 'player-a',
      playerId: 'player-a',
      tileId: 3,
    }, immediateContext);
    expect(store.getSnapshot().destinationPreview).toBeNull();

    const snapStore = new PresentationStore();
    snapStore.resetFromSnapshot(makeRoom());
    await createMovementExecutor(snapStore).run(
      walkEvent({ to: 3, steps: 3, presentation: 'SNAP' }),
      immediateContext,
    );
    expect(snapStore.getSnapshot().destinationPreview).toBeNull();
  });

  it('snaps instead of creating a giant hop when the active executor is interrupted', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const controller = new AbortController();
    const executor = createMovementExecutor(store);
    await executor.run(walkEvent({ to: 2, steps: 2 }), {
      ...immediateContext,
      signal: controller.signal,
      waitForDuration: () => Promise.resolve(),
    });
    controller.abort();
    executor.finish(walkEvent({ to: 2, steps: 2 }), {
      ...immediateContext,
      signal: controller.signal,
    });

    expect(store.getSnapshot().characterMovements.at(-1)).toMatchObject({
      transition: 'SNAP',
      toTileId: 2,
    });
    expect(store.getSnapshot().settledPositions['player-a']).toBe(2);
  });
});
