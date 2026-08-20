import type { MoveCharacterPresentationEvent } from '../events/types';
import { presentationTiming } from '../timings';
import type { PresentationExecutor } from '../queue/types';
import type { PresentationStoreLike } from '../store/types';

export function createMovementExecutor(store: PresentationStoreLike): PresentationExecutor<MoveCharacterPresentationEvent> {
  return {
    async run(event, context) {
      if (event.presentation === 'SNAP' || context.reducedMotion) {
        store.snapDisplayPosition(event.playerId, event.to);
        return;
      }
      let fromTileId = event.from;
      for (let step = 1; step <= event.steps; step += 1) {
        const tileId = (fromTileId + 1) % 40;
        const durationMs = context.getDuration(presentationTiming.tileHop);
        store.startCharacterHop(event.playerId, fromTileId, tileId, durationMs);
        await context.waitForDuration(durationMs);
        store.completeCharacterHop(event.playerId, tileId);
        if (step < event.steps) store.emitTileImpact(event.playerId, tileId, 'STEP');
        fromTileId = tileId;
      }
    },
    finish(event, context) {
      if (context.signal.aborted) store.snapDisplayPosition(event.playerId, event.to);
    },
  };
}

