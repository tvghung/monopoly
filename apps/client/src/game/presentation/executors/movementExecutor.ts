import type { MoveCharacterPresentationEvent } from '../events/types';
import { presentationTiming } from '../timings';
import type { PresentationExecutor } from '../queue/types';
import type { PresentationStoreLike } from '../store/types';

export function createMovementExecutor(store: PresentationStoreLike): PresentationExecutor<MoveCharacterPresentationEvent> {
  return {
    async run(event, context) {
      if (event.presentation === 'SNAP' || context.reducedMotion) {
        store.setDisplayPosition(event.playerId, event.to);
        return;
      }
      for (let step = 1; step <= event.steps; step += 1) {
        await context.wait(presentationTiming.tileHop);
        store.setDisplayPosition(event.playerId, (event.from + step) % 40);
      }
    },
    finish(event) {
      store.setDisplayPosition(event.playerId, event.to);
    },
  };
}

