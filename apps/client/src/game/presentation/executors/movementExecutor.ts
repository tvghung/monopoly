import type { MoveCharacterPresentationEvent } from '../events/types';
import { presentationTiming } from '../timings';
import type { PresentationExecutor } from '../queue/types';
import type { PresentationStoreLike } from '../store/types';

export function createMovementExecutor(store: PresentationStoreLike): PresentationExecutor<MoveCharacterPresentationEvent> {
  return {
    async run(event, context) {
      if (event.presentation === 'SNAP' || context.reducedMotion) {
        store.startDisplayPosition(event.playerId, event.to);
        store.settleDisplayPosition(event.playerId, event.to);
        return;
      }
      for (let step = 1; step <= event.steps; step += 1) {
        const tileId = (event.from + step) % 40;
        store.startDisplayPosition(event.playerId, tileId);
        await context.wait(presentationTiming.tileHop);
        store.settleDisplayPosition(event.playerId, tileId);
        if (step < event.steps) store.emitTileImpact(event.playerId, tileId, 'STEP');
      }
    },
    finish(event) {
      store.settleDisplayPosition(event.playerId, event.to);
    },
  };
}

