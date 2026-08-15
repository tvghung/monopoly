import type { RollDicePresentationEvent } from '../events/types';
import type { PresentationExecutor } from '../queue/types';
import type { PresentationStoreLike } from '../store/types';
import { presentationTiming } from '../timings';

export function createDiceExecutor(store: PresentationStoreLike): PresentationExecutor<RollDicePresentationEvent> {
  return {
    async run(event, context) {
      await context.wait(presentationTiming.diceRoll);
      store.setDisplayDice({ dice1: event.dice1, dice2: event.dice2 });
    },
    finish(event) {
      store.setDisplayDice({ dice1: event.dice1, dice2: event.dice2 });
    },
  };
}

