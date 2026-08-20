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
      const durationMs = context.getDuration(presentationTiming.landing);
      const depressDurationMs = context.getDuration(presentationTiming.tileImpact.landDepress);
      const reboundDurationMs = context.getDuration(presentationTiming.tileImpact.landRebound);
      if (!context.reducedMotion) {
        store.emitTileImpact(event.playerId, event.tileId, 'LAND', {
          delayMs: 0,
          depressDurationMs,
          reboundDurationMs,
        });
        store.emitCharacterLanding(event.playerId, event.tileId, durationMs);
      }
      await context.waitForDuration(durationMs);
    },
    finish() {},
  };
  const jailExecutor: PresentationExecutor = {
    async run(event, context) {
      const durationMs = context.getDuration(presentationTiming.characterReaction.jail);
      if (event.type === 'JAIL_STATE_CHANGED' && event.isJail) {
        if (!context.reducedMotion) store.emitCharacterReaction(event.playerId, 'jail', durationMs);
      }
      await context.waitForDuration(durationMs);
    },
    finish() {},
  };
  const finishedExecutor: PresentationExecutor = {
    async run(event, context) {
      const durationMs = context.getDuration(presentationTiming.characterReaction.bankrupt);
      if (event.type === 'PLAYER_FINISHED') {
        if (!context.reducedMotion) {
          store.emitCharacterReaction(
            event.playerId,
            event.reason === 'BANKRUPT' ? 'bankrupt' : 'sad',
            durationMs,
          );
        }
      }
      await context.waitForDuration(durationMs);
    },
    finish() {},
  };
  return {
    LAND_TILE: landingExecutor,
    BALANCE_CHANGED: createTimedExecutor(presentationTiming.balanceChange),
    PROPERTY_OWNERSHIP_CHANGED: createTimedExecutor(presentationTiming.propertyPurchase),
    PROPERTY_DEVELOPMENT_CHANGED: createTimedExecutor(presentationTiming.buildPop),
    JAIL_STATE_CHANGED: jailExecutor,
    PLAYER_FINISHED: finishedExecutor,
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

