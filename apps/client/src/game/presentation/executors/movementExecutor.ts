import { NOOP_AUDIO_PORT, type AudioPort } from '../../../audio/types';
import type { MoveCharacterPresentationEvent } from '../events/types';
import { presentationTiming } from '../timings';
import type { AnimationExecutionContext, PresentationExecutor } from '../queue/types';
import type { PresentationStoreLike } from '../store/types';

const BOARD_SIZE = 40;

function isExecutionCurrent(context: AnimationExecutionContext): boolean {
  return !context.signal.aborted && (context.isCurrent?.() ?? true);
}

export function createMovementExecutor(
  store: PresentationStoreLike,
  audio: AudioPort = NOOP_AUDIO_PORT,
): PresentationExecutor<MoveCharacterPresentationEvent> {
  const startPassGoMoment = (
    event: MoveCharacterPresentationEvent,
    fromTileId: number,
    context: AnimationExecutionContext,
  ): { holdDurationMs: number; completion: Promise<void> } | null => {
    const passGo = event.passGo;
    if (!passGo || !isExecutionCurrent(context)) return null;
    const duration = context.getDuration(presentationTiming.goMoment);
    store.emitGoCrossing(
      passGo.eventId,
      event.playerId,
      fromTileId,
      duration,
    );
    store.emitMoneyTransfer({
      id: `${passGo.eventId}:money`,
      source: { kind: 'BANK' },
      destination: { kind: 'PLAYER', playerId: event.playerId },
      amount: passGo.reward,
      reason: 'PASS_GO',
      durationMs: context.getDuration(presentationTiming.moneyTransfer),
    });
    audio.play('money.receive', { signal: context.signal });
    return {
      holdDurationMs: context.getDuration(presentationTiming.goHold),
      completion: context.waitForDuration(duration),
    };
  };

  return {
    async run(event, context) {
      const previewId = `${event.id}:destination-preview`;
      if (event.presentation === 'WALK') {
        store.showDestinationPreview({
          id: previewId,
          playerId: event.playerId,
          tileId: event.to,
          strongDurationMs: context.getDuration(presentationTiming.destinationPreviewStrong),
        });
      }
      if (event.presentation === 'SNAP' || context.reducedMotion) {
        if (!isExecutionCurrent(context)) return;
        store.snapDisplayPosition(event.playerId, event.to);
        if (event.presentation === 'WALK' && event.passGo) {
          const passGoMoment = startPassGoMoment(event, event.passGo.fromTile, context);
          if (passGoMoment) await passGoMoment.completion;
        }
        return;
      }
      await context.wait(presentationTiming.destinationPreviewLead);
      let fromTileId = event.from;
      let passGoCompletion: Promise<void> | null = null;
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
        audio.play('movement.hop', { signal: context.signal });
        if (tileId === 0 && event.passGo) {
          const passGoMoment = startPassGoMoment(event, fromTileId, context);
          if (passGoMoment) {
            passGoCompletion = passGoMoment.completion;
            await context.waitForDuration(passGoMoment.holdDurationMs);
          }
        }
        fromTileId = tileId;
      }
      if (passGoCompletion) await passGoCompletion;
    },
    finish(event, context) {
      if (context.signal.aborted && (context.isCurrent?.() ?? true)) {
        store.snapDisplayPosition(event.playerId, event.to);
        store.clearDestinationPreview(`${event.id}:destination-preview`);
      }
    },
  };
}

