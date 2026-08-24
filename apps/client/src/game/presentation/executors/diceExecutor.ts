import type { RollDicePresentationEvent } from '../events/types';
import type { PresentationExecutor } from '../queue/types';
import type { PresentationStoreLike } from '../store/types';
import { presentationTiming } from '../timings';

export function createDiceExecutor(store: PresentationStoreLike): PresentationExecutor<RollDicePresentationEvent> {
  return {
    async run(event, context) {
      const durationMs = context.getDuration(presentationTiming.diceRoll);
      store.startDiceRoll(
        { dice1: event.dice1, dice2: event.dice2 },
        event.rollSequence,
        durationMs,
      );
      if (context.reducedMotion) {
        store.settleDiceRoll(
          { dice1: event.dice1, dice2: event.dice2 },
          event.rollSequence,
        );
        return;
      }
      await context.waitForDuration(durationMs);
      store.settleDiceRoll(
        { dice1: event.dice1, dice2: event.dice2 },
        event.rollSequence,
      );
      await context.wait(presentationTiming.diceResultHold);
    },
    finish(event) {
      store.settleDiceRoll(
        { dice1: event.dice1, dice2: event.dice2 },
        event.rollSequence,
      );
    },
  };
}

