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
        const hopDurationMs = context.getDuration(presentationTiming.tileHop);
        const depressDurationMs = Math.min(hopDurationMs, context.getDuration(presentationTiming.tileImpact.stepDepress));
        const reboundDurationMs = context.getDuration(presentationTiming.tileImpact.stepRebound);
        store.startCharacterHop(event.playerId, fromTileId, tileId, hopDurationMs);
        if (step < event.steps) {
          store.emitTileImpact(event.playerId, tileId, 'STEP', {
            delayMs: Math.max(0, hopDurationMs - depressDurationMs),
            depressDurationMs,
            reboundDurationMs,
          });
        }
        await context.waitForDuration(hopDurationMs);
        store.completeCharacterHop(event.playerId, tileId);
        fromTileId = tileId;
      }
    },
    finish(event, context) {
      if (context.signal.aborted) store.snapDisplayPosition(event.playerId, event.to);
    },
  };
}

