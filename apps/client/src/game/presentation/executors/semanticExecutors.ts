import type {
  CardInteractionChangedPresentationEvent,
  JailReleasedPresentationEvent,
  JailRollFailedPresentationEvent,
  MoneyTransferPresentationEvent,
  PassGoPresentationEvent,
  PropertyTransferPresentationEvent,
  SentToJailPresentationEvent,
} from '../events/types';
import type { PresentationExecutor, PresentationExecutorMap } from '../queue/types';
import type { PresentationStoreLike } from '../store/types';
import { presentationTiming } from '../timings';

function current(context: Parameters<PresentationExecutor['run']>[1]): boolean {
  return !context.signal.aborted && (context.isCurrent?.() ?? true);
}

const endpointPlayerId = (endpoint: MoneyTransferPresentationEvent['source']): string | null => (
  endpoint.kind === 'PLAYER' ? endpoint.playerId : null
);

export function createSemanticExecutors(store: PresentationStoreLike): PresentationExecutorMap {
  const money: PresentationExecutor<MoneyTransferPresentationEvent> = {
    async run(event, context) {
      if (!current(context)) return;
      const semanticDuration = context.getSemanticDuration(
        presentationTiming.moneyTransfer,
        presentationTiming.moneyTransferMinimum,
      );
      const physicalDuration = context.getDuration(presentationTiming.moneyTransfer);
      store.emitMoneyTransfer({
        id: event.id,
        source: event.source,
        destination: event.destination,
        amount: event.amount,
        reason: event.reason,
        durationMs: physicalDuration,
      });
      store.showBoardEvent({
        id: event.id,
        kind: 'MONEY_TRANSFER',
        playerIds: [endpointPlayerId(event.source), endpointPlayerId(event.destination)]
          .filter((id): id is string => Boolean(id)),
        tileIds: [],
        amount: event.amount,
        reason: event.reason,
        source: event.source,
        destination: event.destination,
        durationMs: semanticDuration,
      });
      await context.waitForSemanticDuration(semanticDuration);
      if (current(context)) store.clearBoardEvent(event.id);
    },
    finish() {},
  };

  const property: PresentationExecutor<PropertyTransferPresentationEvent> = {
    async run(event, context) {
      if (!current(context)) return;
      const semanticDuration = context.getSemanticDuration(
        presentationTiming.propertyTransfer,
        presentationTiming.propertyTransferMinimum,
      );
      const pulseDuration = context.getDuration(presentationTiming.feedbackPulse);
      const playerIds = [...new Set(event.transfers.flatMap(transfer => [
        transfer.fromPlayerId,
        transfer.toPlayerId,
      ]).filter((id): id is string => Boolean(id)))];
      store.showBoardEvent({
        id: event.id,
        kind: event.cause === 'BANK_PURCHASE' ? 'PROPERTY_PURCHASE' : 'PROPERTY_TRANSFER',
        playerIds,
        tileIds: event.transfers.map(transfer => transfer.tileId),
        ...(event.amount ? { amount: event.amount } : {}),
        cause: event.cause,
        durationMs: semanticDuration,
      });
      await context.waitForSemanticDuration(Math.round(semanticDuration * 0.68));
      if (!current(context)) return;
      event.transfers.forEach(transfer => store.emitOwnershipChange(
        transfer.eventId,
        transfer.tileId,
        transfer.fromPlayerId,
        transfer.toPlayerId,
        pulseDuration,
      ));
      await context.waitForSemanticDuration(Math.round(semanticDuration * 0.32));
      if (current(context)) store.clearBoardEvent(event.id);
    },
    finish() {},
  };

  const passGo: PresentationExecutor<PassGoPresentationEvent> = {
    async run(event, context) {
      if (!current(context)) return;
      const duration = context.getSemanticDuration(
        presentationTiming.goMoment,
        presentationTiming.goMomentMinimum,
      );
      const playerId = event.event.playerId;
      store.emitGoCrossing(event.id, playerId, event.event.fromTile, duration);
      store.emitMoneyTransfer({
        id: `${event.id}:money`,
        source: { kind: 'BANK' },
        destination: { kind: 'PLAYER', playerId },
        amount: event.event.reward,
        reason: 'PASS_GO',
        durationMs: context.getDuration(presentationTiming.moneyTransfer),
      });
      store.showBoardEvent({
        id: event.id,
        kind: 'PASS_GO',
        playerIds: [playerId],
        tileIds: [0],
        amount: event.event.reward,
        source: { kind: 'BANK' },
        destination: { kind: 'PLAYER', playerId },
        durationMs: duration,
      });
      await context.waitForSemanticDuration(duration);
      if (current(context)) store.clearBoardEvent(event.id);
    },
    finish() {},
  };

  const sentToJail: PresentationExecutor<SentToJailPresentationEvent> = {
    async run(event, context) {
      if (!current(context)) return;
      const semanticDuration = context.getSemanticDuration(
        presentationTiming.jailMoment,
        presentationTiming.jailMomentMinimum,
      );
      const physicalDuration = context.getDuration(presentationTiming.jailTransfer);
      const { playerId, fromTile, destinationTile } = event.event;
      store.showBoardEvent({
        id: event.id,
        kind: 'SENT_TO_JAIL',
        playerIds: [playerId],
        tileIds: [destinationTile],
        cause: event.event.cause,
        durationMs: semanticDuration,
      });
      if (physicalDuration > 0) {
        store.startJailTransfer(playerId, fromTile, destinationTile, physicalDuration);
        store.emitCharacterReaction(playerId, 'jail', physicalDuration);
      } else {
        store.snapDisplayPosition(playerId, destinationTile);
      }
      await context.waitForDuration(physicalDuration);
      if (!current(context)) return;
      if (physicalDuration > 0) store.completeCharacterHop(playerId, destinationTile);
      store.emitTileImpact(playerId, destinationTile, 'LAND', {
        delayMs: 0,
        depressDurationMs: context.getDuration(presentationTiming.tileImpact.landDepress),
        reboundDurationMs: context.getDuration(presentationTiming.tileImpact.landRebound),
      });
      await context.waitForSemanticDuration(Math.max(0, semanticDuration - physicalDuration));
      if (current(context)) store.clearBoardEvent(event.id);
    },
    finish(event, context) {
      if (context.signal.aborted && (context.isCurrent?.() ?? true)) {
        store.snapDisplayPosition(event.event.playerId, event.event.destinationTile);
        store.clearBoardEvent(event.id);
      }
    },
  };

  const jailRollFailed: PresentationExecutor<JailRollFailedPresentationEvent> = {
    async run(event, context) {
      if (!current(context)) return;
      const duration = context.getSemanticDuration(
        presentationTiming.jailRollFailed,
        presentationTiming.jailRollFailedMinimum,
      );
      store.showBoardEvent({
        id: event.id,
        kind: 'JAIL_ROLL_FAILED',
        playerIds: [event.playerId],
        tileIds: [10],
        durationMs: duration,
      });
      if (!context.reducedMotion) store.emitCharacterReaction(event.playerId, 'sad', context.getDuration(320));
      await context.waitForSemanticDuration(duration);
      if (current(context)) store.clearBoardEvent(event.id);
    },
    finish() {},
  };

  const jailReleased: PresentationExecutor<JailReleasedPresentationEvent> = {
    async run(event, context) {
      if (!current(context)) return;
      const duration = context.getSemanticDuration(
        presentationTiming.jailRelease,
        presentationTiming.jailReleaseMinimum,
      );
      store.showBoardEvent({
        id: event.id,
        kind: 'JAIL_RELEASED',
        playerIds: [event.playerId],
        tileIds: [10],
        cause: event.cause,
        durationMs: duration,
      });
      await context.waitForSemanticDuration(duration);
      if (current(context)) store.clearBoardEvent(event.id);
    },
    finish() {},
  };

  const card: PresentationExecutor<CardInteractionChangedPresentationEvent> = {
    async run(event, context) {
      if (!current(context)) return;
      if (event.stage === 'CLOSED') {
        store.setCardPresentation(null);
        return;
      }
      if (event.stage === 'AWAITING_DRAW') {
        store.setCardPresentation({
          operationId: event.operationId,
          playerId: event.playerId,
          deck: event.deck,
          sourceTile: event.sourceTile,
          stage: 'AWAITING_DRAW',
          durationMs: 0,
        });
        return;
      }
      const duration = context.getDuration(presentationTiming.cardDraw);
      store.setCardPresentation({
        operationId: event.operationId,
        playerId: event.playerId,
        deck: event.deck,
        sourceTile: event.sourceTile,
        stage: duration > 0 ? 'DRAWING' : 'REVEALED',
        durationMs: duration,
      });
      await context.waitForDuration(duration);
      if (current(context)) store.setCardPresentation({
        operationId: event.operationId,
        playerId: event.playerId,
        deck: event.deck,
        sourceTile: event.sourceTile,
        stage: 'REVEALED',
        durationMs: 0,
      });
    },
    finish() {},
  };

  return {
    MONEY_TRANSFER: money,
    PROPERTY_TRANSFER: property,
    PASS_GO: passGo,
    SENT_TO_JAIL: sentToJail,
    JAIL_ROLL_FAILED: jailRollFailed,
    JAIL_RELEASED: jailReleased,
    CARD_INTERACTION_CHANGED: card,
  };
}
