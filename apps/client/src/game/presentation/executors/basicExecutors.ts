import { NOOP_AUDIO_PORT, type AudioPort } from '../../../audio/types';
import type {
  BalanceChangedPresentationEvent,
  GameFinishedPresentationEvent,
  LandTilePresentationEvent,
  PresentationEvent,
  PresentationEventType,
  PropertyDevelopmentChangedPresentationEvent,
  PropertyOwnershipChangedPresentationEvent,
} from '../events/types';
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

function isExecutionCurrent(context: AnimationExecutionContext): boolean {
  return !context.signal.aborted && (context.isCurrent?.() ?? true);
}

function createConsequenceExecutor<E extends PresentationEvent>(
  duration: number,
  emit: (event: E, durationMs: number) => void,
  play?: (event: E, context: AnimationExecutionContext) => void,
): PresentationExecutor<E> {
  return {
    async run(event, context) {
      if (!isExecutionCurrent(context)) return;
      const durationMs = context.getDuration(duration);
      emit(event, durationMs);
      play?.(event, context);
      await context.waitForDuration(durationMs);
    },
    finish() {},
  };
}

export function createBasicExecutors(
  store: PresentationStoreLike,
  audio: AudioPort = NOOP_AUDIO_PORT,
): PresentationExecutorMap {
  const turnExecutor = createTimedExecutor(
    presentationTiming.turnChange,
    (event, target) => {
      if (event.type === 'TURN_CHANGED') target.setDisplayActivePlayerId(event.toPlayerId);
    },
    store,
  );
  const landingExecutor: PresentationExecutor<LandTilePresentationEvent> = {
    async run(event, context) {
      store.clearDestinationPreview();
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
        if (isExecutionCurrent(context)) audio.play('jail.enter', { signal: context.signal });
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
        if (event.reason === 'BANKRUPT' && isExecutionCurrent(context)) {
          audio.play('bankruptcy', { signal: context.signal });
        }
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
  const balanceExecutor = createConsequenceExecutor<BalanceChangedPresentationEvent>(
    presentationTiming.balanceChange,
    (event, durationMs) => store.emitBalanceDelta(
      event.id,
      event.playerId,
      event.from,
      event.to,
      durationMs,
    ),
  );
  const ownershipExecutor = createConsequenceExecutor<PropertyOwnershipChangedPresentationEvent>(
    presentationTiming.propertyPurchase,
    (event, durationMs) => store.emitOwnershipChange(
      event.id,
      event.tileId,
      event.fromPlayerId,
      event.toPlayerId,
      durationMs,
    ),
    (_event, context) => audio.play('property.change', { signal: context.signal }),
  );
  const developmentExecutor: PresentationExecutor<PropertyDevelopmentChangedPresentationEvent> = {
    async run(event, context) {
      if (!isExecutionCurrent(context)) return;
      const added = Math.max(0, Math.min(4, event.toHouses) - Math.min(4, event.fromHouses));
      const baseDuration = event.fromHouses === 4 && event.toHouses === 5
        ? presentationTiming.hotelTransition
        : added > 0
          ? presentationTiming.housePop + (added - 1) * presentationTiming.houseStagger
          : 0;
      const durationMs = context.getDuration(baseDuration);
      store.emitDevelopmentChange(
        event.id,
        event.tileId,
        event.playerId,
        event.fromHouses,
        event.toHouses,
        durationMs,
      );
      if (event.fromHouses === 4 && event.toHouses === 5) {
        audio.play('build.hotel', { signal: context.signal });
      } else if (event.toHouses > event.fromHouses) {
        audio.play('build.house', { signal: context.signal });
      } else if (event.toHouses < event.fromHouses) {
        audio.play('build.remove', { signal: context.signal });
      }
      await context.waitForDuration(durationMs);
    },
    finish() {},
  };
  const gameFinishedExecutor: PresentationExecutor<GameFinishedPresentationEvent> = {
    async run(event, context) {
      if (event.winnerPlayerId && isExecutionCurrent(context)) {
        audio.play('victory', { signal: context.signal });
      }
      await context.wait(presentationTiming.finish);
    },
    finish() {},
  };
  return {
    LAND_TILE: landingExecutor,
    BALANCE_CHANGED: balanceExecutor,
    PROPERTY_OWNERSHIP_CHANGED: ownershipExecutor,
    PROPERTY_DEVELOPMENT_CHANGED: developmentExecutor,
    JAIL_STATE_CHANGED: jailExecutor,
    PLAYER_FINISHED: finishedExecutor,
    TURN_CHANGED: turnExecutor,
    GAME_FINISHED: gameFinishedExecutor,
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
    MONEY_TRANSFER: true,
    PROPERTY_TRANSFER: true,
    PASS_GO: true,
    SENT_TO_JAIL: true,
    JAIL_ROLL_FAILED: true,
    JAIL_RELEASED: true,
    CARD_INTERACTION_CHANGED: true,
    PLAYER_FINISHED: true,
    TURN_CHANGED: true,
    GAME_FINISHED: true,
  };
}

