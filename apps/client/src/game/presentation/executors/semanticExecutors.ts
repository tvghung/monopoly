import { NOOP_AUDIO_PORT, type AudioCueId, type AudioPort } from '../../../audio/types';
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

function moneyCue(event: MoneyTransferPresentationEvent): AudioCueId {
  if (event.source.kind === 'BANK' && event.destination.kind === 'PLAYER') return 'money.receive';
  if (event.source.kind === 'PLAYER' && event.destination.kind === 'BANK') return 'money.pay';
  return 'money.transfer';
}

function propertyCue(event: PropertyTransferPresentationEvent): AudioCueId {
  if (event.cause === 'BANK_PURCHASE') return 'property.purchase';
  if (event.cause === 'BANK_SALE'
    || event.cause === 'BANKRUPTCY'
    || event.cause === 'PLAYER_LEFT') return 'property.release';
  return 'property.transfer';
}

export function createSemanticExecutors(
  store: PresentationStoreLike,
  audio: AudioPort = NOOP_AUDIO_PORT,
): PresentationExecutorMap {
  const money: PresentationExecutor<MoneyTransferPresentationEvent> = {
    async run(event, context) {
      if (!current(context)) return;
      const physicalDuration = context.getDuration(presentationTiming.moneyTransfer);
      store.emitMoneyTransfer({
        id: event.id,
        source: event.source,
        destination: event.destination,
        amount: event.amount,
        reason: event.reason,
        durationMs: physicalDuration,
      });
      audio.play(moneyCue(event), { signal: context.signal, scope: 'presentation' });
      await context.waitForDuration(physicalDuration);
    },
    finish() {},
  };

  const property: PresentationExecutor<PropertyTransferPresentationEvent> = {
    async run(event, context) {
      if (!current(context)) return;
      const pulseDuration = context.getDuration(presentationTiming.feedbackPulse);
      event.transfers.forEach(transfer => store.emitOwnershipChange(
        transfer.eventId,
        transfer.tileId,
        transfer.fromPlayerId,
        transfer.toPlayerId,
        pulseDuration,
      ));
      audio.play(propertyCue(event), { signal: context.signal, scope: 'presentation' });
      await context.waitForDuration(pulseDuration);
    },
    finish() {},
  };

  const passGo: PresentationExecutor<PassGoPresentationEvent> = {
    async run(event, context) {
      if (!current(context)) return;
      const duration = context.getDuration(presentationTiming.goMoment);
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
      audio.play('money.receive', { signal: context.signal, scope: 'presentation' });
      await context.waitForDuration(duration);
    },
    finish() {},
  };

  const sentToJail: PresentationExecutor<SentToJailPresentationEvent> = {
    async run(event, context) {
      if (!current(context)) return;
      const physicalDuration = context.getDuration(presentationTiming.jailTransfer);
      const { playerId, fromTile, destinationTile } = event.event;
      if (physicalDuration > 0) {
        store.startJailTransfer(playerId, fromTile, destinationTile, physicalDuration);
        store.emitCharacterReaction(playerId, 'jail', physicalDuration);
      } else {
        store.snapDisplayPosition(playerId, destinationTile);
      }
      await context.waitForDuration(physicalDuration);
      if (!current(context)) return;
      if (physicalDuration > 0) store.completeCharacterHop(playerId, destinationTile);
      audio.play('jail.enter', { signal: context.signal, scope: 'presentation' });
      store.emitTileImpact(playerId, destinationTile, 'LAND', {
        delayMs: 0,
        depressDurationMs: context.getDuration(presentationTiming.tileImpact.landDepress),
        reboundDurationMs: context.getDuration(presentationTiming.tileImpact.landRebound),
      });
      await context.waitForDuration(
        context.getDuration(presentationTiming.tileImpact.landDepress)
        + context.getDuration(presentationTiming.tileImpact.landRebound),
      );
    },
    finish(event, context) {
      if (context.signal.aborted && (context.isCurrent?.() ?? true)) {
        store.snapDisplayPosition(event.event.playerId, event.event.destinationTile);
      }
    },
  };

  const jailRollFailed: PresentationExecutor<JailRollFailedPresentationEvent> = {
    async run(event, context) {
      if (!current(context)) return;
      const duration = context.getDuration(presentationTiming.characterReaction.sad);
      if (!context.reducedMotion) store.emitCharacterReaction(event.playerId, 'sad', duration);
      audio.play('jail.failed', { signal: context.signal, scope: 'presentation' });
      await context.waitForDuration(duration);
    },
    finish() {},
  };

  const jailReleased: PresentationExecutor<JailReleasedPresentationEvent> = {
    run(_event, context) {
      if (current(context)) {
        audio.play('jail.release', { signal: context.signal, scope: 'presentation' });
      }
      return Promise.resolve();
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
        const duration = context.getDuration(presentationTiming.cardDraw);
        store.setCardPresentation({
          operationId: event.operationId,
          playerId: event.playerId,
          deck: event.deck,
          sourceTile: event.sourceTile,
          stage: duration > 0 ? 'DRAWING' : 'AWAITING_DRAW',
          durationMs: duration,
        });
        audio.play('card.draw', { signal: context.signal, scope: 'presentation' });
        await context.waitForDuration(duration);
        if (current(context)) store.setCardPresentation({
          operationId: event.operationId,
          playerId: event.playerId,
          deck: event.deck,
          sourceTile: event.sourceTile,
          stage: 'AWAITING_DRAW',
          durationMs: 0,
        });
        return;
      }
      const duration = context.getDuration(presentationTiming.cardReveal);
      store.setCardPresentation({
        operationId: event.operationId,
        playerId: event.playerId,
        deck: event.deck,
        sourceTile: event.sourceTile,
        stage: duration > 0 ? 'REVEALING' : 'REVEALED',
        ...(event.revealedCardId ? { revealedCardId: event.revealedCardId } : {}),
        durationMs: duration,
      });
      audio.play('card.reveal', { signal: context.signal, scope: 'presentation' });
      await context.waitForDuration(duration);
      if (current(context)) store.setCardPresentation({
        operationId: event.operationId,
        playerId: event.playerId,
        deck: event.deck,
        sourceTile: event.sourceTile,
        stage: 'REVEALED',
        ...(event.revealedCardId ? { revealedCardId: event.revealedCardId } : {}),
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
