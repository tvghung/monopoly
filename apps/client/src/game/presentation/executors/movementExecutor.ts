import type { MoveCharacterPresentationEvent } from '../events/types';
import { presentationTiming } from '../timings';
import type { AnimationExecutionContext, PresentationExecutor } from '../queue/types';
import type { PresentationStoreLike } from '../store/types';

const BOARD_SIZE = 40;

function isExecutionCurrent(context: AnimationExecutionContext): boolean {
  return !context.signal.aborted && (context.isCurrent?.() ?? true);
}

export function createMovementExecutor(store: PresentationStoreLike): PresentationExecutor<MoveCharacterPresentationEvent> {
  const emitGoCrossing = (
    event: MoveCharacterPresentationEvent,
    fromTileId: number,
    toTileId: number,
    context: AnimationExecutionContext,
  ) => {
    if (event.presentation !== 'WALK' || toTileId !== 0 || !isExecutionCurrent(context)) return;
    store.emitGoCrossing(
      `${event.id}:go`,
      event.playerId,
      fromTileId,
      context.getDuration(presentationTiming.balanceChange),
    );
  };

  return {
    async run(event, context) {
      if (event.presentation === 'SNAP' || context.reducedMotion) {
        if (event.presentation === 'WALK' && context.reducedMotion) {
          let routeTileId = event.from;
          for (let step = 1; step <= event.steps; step += 1) {
            const tileId = (routeTileId + 1) % BOARD_SIZE;
            emitGoCrossing(event, routeTileId, tileId, context);
            routeTileId = tileId;
          }
        }
        if (!isExecutionCurrent(context)) return;
        store.snapDisplayPosition(event.playerId, event.to);
        return;
      }
      let fromTileId = event.from;
      for (let step = 1; step <= event.steps; step += 1) {
        if (!isExecutionCurrent(context)) return;
        const tileId = (fromTileId + 1) % BOARD_SIZE;
        const hopDurationMs = context.getDuration(presentationTiming.tileHop);
        const depressDurationMs = Math.min(hopDurationMs, context.getDuration(presentationTiming.tileImpact.stepDepress));
        const reboundDurationMs = context.getDuration(presentationTiming.tileImpact.stepRebound);
        store.startCharacterHop(event.playerId, fromTileId, tileId, hopDurationMs);
        if (step < event.steps && isExecutionCurrent(context)) {
          store.emitTileImpact(event.playerId, tileId, 'STEP', {
            delayMs: Math.max(0, hopDurationMs - depressDurationMs),
            depressDurationMs,
            reboundDurationMs,
          });
        }
        await context.waitForDuration(hopDurationMs);
        if (!isExecutionCurrent(context)) return;
        store.completeCharacterHop(event.playerId, tileId);
        emitGoCrossing(event, fromTileId, tileId, context);
        fromTileId = tileId;
      }
    },
    finish(event, context) {
      if (context.signal.aborted && (context.isCurrent?.() ?? true)) {
        store.snapDisplayPosition(event.playerId, event.to);
      }
    },
  };
}

