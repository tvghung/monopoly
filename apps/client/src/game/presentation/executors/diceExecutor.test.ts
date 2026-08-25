import { describe, expect, it } from 'vitest';
import type { AudioPort } from '../../../audio/types';
import type { RollDicePresentationEvent } from '../events/types';
import type { AnimationExecutionContext } from '../queue/types';
import { makeRoom } from '../testFixtures';
import { PresentationStore } from '../store/presentationStore';
import { presentationTiming } from '../timings';
import { createDiceExecutor } from './diceExecutor';

const immediateContext: AnimationExecutionContext = {
  signal: new AbortController().signal,
  speedMultiplier: 1,
  reducedMotion: false,
  getDuration: duration => duration,
  wait: async () => {},
  waitForDuration: async () => {},
};

function rollEvent(rollSequence: number): RollDicePresentationEvent {
  return {
    id: `room-1:roll-${rollSequence}`,
    roomId: 'room-1',
    roomVersion: rollSequence + 1,
    type: 'ROLL_DICE',
    entityId: 'room',
    dice1: 2,
    dice2: 2,
    rollSequence,
  };
}

describe('dice presentation executor', () => {
  it('plays impact at the shared visual contact milestone before final settlement', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const waits: number[] = [];
    let displaySequenceAtImpact: number | undefined;
    const audio: AudioPort = {
      play: cue => {
        if (cue === 'dice.impact') displaySequenceAtImpact = store.getSnapshot().displayRollSequence;
      },
      handleUserInteraction: () => {},
    };

    await createDiceExecutor(store, audio).run(rollEvent(1), {
      ...immediateContext,
      waitForDuration: duration => { waits.push(duration); return Promise.resolve(); },
      wait: () => Promise.resolve(),
    });

    expect(waits[0]).toBeCloseTo(presentationTiming.diceRoll * presentationTiming.diceContactProgress);
    expect(waits[1]).toBeCloseTo(
      presentationTiming.diceRoll * (1 - presentationTiming.diceContactProgress),
    );
    expect(displaySequenceAtImpact).toBe(0);
    expect(store.getSnapshot().displayRollSequence).toBe(1);
  });

  it('publishes identical faces again when the authoritative sequence advances', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const executor = createDiceExecutor(store);

    await executor.run(rollEvent(1), immediateContext);
    await executor.run(rollEvent(2), immediateContext);

    expect(store.getSnapshot().displayDice).toEqual({ dice1: 2, dice2: 2 });
    expect(store.getSnapshot().displayRollSequence).toBe(2);
  });

  it('holds movement behind the 640ms roll and 140ms result boundary', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const executor = createDiceExecutor(store);
    let releaseDuration: (() => void) | undefined;
    let releaseSettlement: (() => void) | undefined;
    let releaseHold: (() => void) | undefined;
    let durationWait = 0;
    const context: AnimationExecutionContext = {
      ...immediateContext,
      waitForDuration: () => new Promise<void>(resolve => {
        if (durationWait === 0) releaseDuration = resolve;
        else releaseSettlement = resolve;
        durationWait += 1;
      }),
      wait: () => new Promise<void>(resolve => { releaseHold = resolve; }),
    };

    const run = executor.run(rollEvent(1), context);
    await Promise.resolve();
    expect(store.getSnapshot().diceRoll).toMatchObject({
      rollSequence: 1,
      durationMs: presentationTiming.diceRoll,
    });
    expect(store.getSnapshot().displayRollSequence).toBe(0);

    releaseDuration?.();
    await Promise.resolve();
    expect(store.getSnapshot().diceRoll).toMatchObject({ lifecycle: 'rolling', rollSequence: 1 });
    expect(store.getSnapshot().displayRollSequence).toBe(0);

    releaseSettlement?.();
    await Promise.resolve();
    expect(store.getSnapshot().diceRoll).toBeNull();
    expect(store.getSnapshot().displayRollSequence).toBe(1);
    expect(releaseHold).toBeTypeOf('function');
    releaseHold?.();
    await run;
  });

  it('snaps immediately in reduced-motion mode without a visual hold', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const executor = createDiceExecutor(store);
    let waited = false;
    await executor.run(rollEvent(1), {
      ...immediateContext,
      reducedMotion: true,
      wait: () => { waited = true; return Promise.resolve(); },
      waitForDuration: () => { waited = true; return Promise.resolve(); },
    });

    expect(waited).toBe(false);
    expect(store.getSnapshot().diceRoll).toBeNull();
    expect(store.getSnapshot().displayDice).toEqual({ dice1: 2, dice2: 2 });
    expect(store.getSnapshot().displayRollSequence).toBe(1);
  });

  it('resolves the roll duration through the existing speed multiplier', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const executor = createDiceExecutor(store);
    let resolvedDuration = 0;
    await executor.run(rollEvent(1), {
      ...immediateContext,
      getDuration: duration => {
        resolvedDuration = duration / 2;
        return resolvedDuration;
      },
    });

    expect(resolvedDuration).toBe(presentationTiming.diceRoll / 2);
  });
});
