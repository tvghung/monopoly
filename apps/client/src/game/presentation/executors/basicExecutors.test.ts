import { describe, expect, it } from 'vitest';
import type {
  JailStateChangedPresentationEvent,
  LandTilePresentationEvent,
  PlayerFinishedPresentationEvent,
} from '../events/types';
import type { AnimationExecutionContext, PresentationExecutor } from '../queue/types';
import { makeRoom } from '../testFixtures';
import { presentationTiming } from '../timings';
import { PresentationStore } from '../store/presentationStore';
import { createBasicExecutors } from './basicExecutors';

const immediateContext: AnimationExecutionContext = {
  signal: new AbortController().signal,
  speedMultiplier: 1,
  reducedMotion: false,
  getDuration: duration => duration,
  wait: async () => {},
  waitForDuration: async () => {},
};

describe('presentation reaction executors', () => {
  it('emits a jail reaction only when the player enters jail', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const executor = createBasicExecutors(store).JAIL_STATE_CHANGED as unknown as PresentationExecutor<JailStateChangedPresentationEvent>;

    await executor.run({
      id: 'jail',
      roomId: 'room-1',
      roomVersion: 2,
      type: 'JAIL_STATE_CHANGED',
      entityId: 'player-a',
      playerId: 'player-a',
      isJail: true,
    }, immediateContext);

    expect(store.getSnapshot().characterReactions).toMatchObject([
      {
        playerId: 'player-a',
        kind: 'jail',
        sequence: 1,
        durationMs: presentationTiming.characterReaction.jail,
      },
    ]);
  });

  it('emits a bankrupt reaction through the presentation layer without changing game state', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const before = store.getSnapshot().displayPositions['player-a'];
    const executor = createBasicExecutors(store).PLAYER_FINISHED as unknown as PresentationExecutor<PlayerFinishedPresentationEvent>;

    await executor.run({
      id: 'finished',
      roomId: 'room-1',
      roomVersion: 2,
      type: 'PLAYER_FINISHED',
      entityId: 'player-a',
      playerId: 'player-a',
      reason: 'BANKRUPT',
    }, immediateContext);

    expect(store.getSnapshot().characterReactions).toMatchObject([
      {
        playerId: 'player-a',
        kind: 'bankrupt',
        sequence: 1,
        durationMs: presentationTiming.characterReaction.bankrupt,
      },
    ]);
    expect(store.getSnapshot().displayPositions['player-a']).toBe(before);
  });

  it('uses neutral landing physics instead of a semantic happy reaction', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const executor = createBasicExecutors(store).LAND_TILE as unknown as PresentationExecutor<LandTilePresentationEvent>;

    await executor.run({
      id: 'land',
      roomId: 'room-1',
      roomVersion: 2,
      type: 'LAND_TILE',
      entityId: 'player-a',
      playerId: 'player-a',
      tileId: 4,
    }, immediateContext);

    expect(store.getSnapshot().characterReactions).toEqual([]);
    expect(store.getSnapshot().characterLandings).toEqual([
      {
        sequence: 1,
        playerId: 'player-a',
        tileId: 4,
        durationMs: presentationTiming.landing,
      },
    ]);
    expect(store.getSnapshot().tileImpacts).toEqual([
      {
        sequence: 1,
        playerId: 'player-a',
        tileId: 4,
        kind: 'LAND',
        depressDurationMs: presentationTiming.tileImpact.landDepress,
        reboundDurationMs: presentationTiming.tileImpact.landRebound,
      },
    ]);
  });

  it.each([0.75, 1, 1.5, 2])('keeps LAND tile and character timing resolved together at %sx', async speed => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const waits: number[] = [];
    const executor = createBasicExecutors(store).LAND_TILE as unknown as PresentationExecutor<LandTilePresentationEvent>;

    await executor.run({
      id: `land-${speed}`,
      roomId: 'room-1',
      roomVersion: 2,
      type: 'LAND_TILE',
      entityId: 'player-a',
      playerId: 'player-a',
      tileId: 4,
    }, {
      ...immediateContext,
      speedMultiplier: speed,
      getDuration: duration => duration / speed,
      waitForDuration: duration => { waits.push(duration); return Promise.resolve(); },
    });

    const landingDuration = presentationTiming.landing / speed;
    const impact = store.getSnapshot().tileImpacts[0];
    expect(store.getSnapshot().characterLandings[0]?.durationMs).toBeCloseTo(landingDuration);
    expect(impact?.depressDurationMs).toBeCloseTo(presentationTiming.tileImpact.landDepress / speed);
    expect(impact?.reboundDurationMs).toBeCloseTo(presentationTiming.tileImpact.landRebound / speed);
    expect(waits[0]).toBeCloseTo(landingDuration);
  });

  it('publishes the same resolved duration that the queued reaction waits', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const executor = createBasicExecutors(store).JAIL_STATE_CHANGED as unknown as PresentationExecutor<JailStateChangedPresentationEvent>;
    const waits: number[] = [];

    await executor.run({
      id: 'jail-fast',
      roomId: 'room-1',
      roomVersion: 2,
      type: 'JAIL_STATE_CHANGED',
      entityId: 'player-a',
      playerId: 'player-a',
      isJail: true,
    }, {
      ...immediateContext,
      speedMultiplier: 2,
      getDuration: duration => duration / 2,
      waitForDuration: duration => { waits.push(duration); return Promise.resolve(); },
    });

    expect(store.getSnapshot().characterReactions[0]?.durationMs).toBeCloseTo(
      presentationTiming.characterReaction.jail / 2,
    );
    expect(waits[0]).toBeCloseTo(presentationTiming.characterReaction.jail / 2);
  });
});
