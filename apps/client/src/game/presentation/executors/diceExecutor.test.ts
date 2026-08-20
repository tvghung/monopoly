import { describe, expect, it } from 'vitest';
import type { RollDicePresentationEvent } from '../events/types';
import type { AnimationExecutionContext } from '../queue/types';
import { makeRoom } from '../testFixtures';
import { PresentationStore } from '../store/presentationStore';
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
  it('publishes identical faces again when the authoritative sequence advances', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const executor = createDiceExecutor(store);

    await executor.run(rollEvent(1), immediateContext);
    await executor.run(rollEvent(2), immediateContext);

    expect(store.getSnapshot().displayDice).toEqual({ dice1: 2, dice2: 2 });
    expect(store.getSnapshot().displayRollSequence).toBe(2);
  });
});
