import type { PresentationEvent, PresentationEventType } from '../events/types';
import type { LandTilePresentationEvent } from '../events/types';
import type { AnimationExecutionContext, PresentationExecutor, PresentationExecutorMap } from '../queue/types';
import type { PresentationStoreLike } from '../store/types';
import { presentationTiming } from '../timings';

function createTimedExecutor(
  duration: number,
  finish?: (event: PresentationEvent, store: PresentationStoreLike) => void,
  store?: PresentationStoreLike,
): PresentationExecutor {
  return {
    async run(_event, context: AnimationExecutionContext) {
      await context.wait(duration);
    },
    finish(event) {
      if (store && finish) finish(event, store);
    },
  };
}

export function createBasicExecutors(store: PresentationStoreLike): PresentationExecutorMap {
  const turnExecutor = createTimedExecutor(
    presentationTiming.turnChange,
    (event, target) => {
      if (event.type === 'TURN_CHANGED') target.setDisplayActivePlayerId(event.toPlayerId);
    },
    store,
  );
  const landingExecutor: PresentationExecutor<LandTilePresentationEvent> = {
    async run(event, context) {
      store.emitTileImpact(event.playerId, event.tileId, 'LAND');
      await context.wait(presentationTiming.landing);
    },
    finish() {},
  };
  return {
    LAND_TILE: landingExecutor,
    BALANCE_CHANGED: createTimedExecutor(presentationTiming.balanceChange),
    PROPERTY_OWNERSHIP_CHANGED: createTimedExecutor(presentationTiming.propertyPurchase),
    PROPERTY_DEVELOPMENT_CHANGED: createTimedExecutor(presentationTiming.buildPop),
    JAIL_STATE_CHANGED: createTimedExecutor(presentationTiming.landing),
    PLAYER_FINISHED: createTimedExecutor(presentationTiming.finish),
    TURN_CHANGED: turnExecutor,
    GAME_FINISHED: createTimedExecutor(presentationTiming.finish),
  };
}

export function isPresentationEventType(value: string): value is PresentationEventType {
  return value in {
    ROLL_DICE: true,
    MOVE_CHARACTER: true,
    LAND_TILE: true,
    BALANCE_CHANGED: true,
    PROPERTY_OWNERSHIP_CHANGED: true,
    PROPERTY_DEVELOPMENT_CHANGED: true,
    JAIL_STATE_CHANGED: true,
    PLAYER_FINISHED: true,
    TURN_CHANGED: true,
    GAME_FINISHED: true,
  };
}

