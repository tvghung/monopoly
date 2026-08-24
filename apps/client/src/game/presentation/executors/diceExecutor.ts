import { NOOP_AUDIO_PORT, type AudioPort } from '../../../audio/types';
import type { RollDicePresentationEvent } from '../events/types';
import type { PresentationExecutor } from '../queue/types';
import type { PresentationStoreLike } from '../store/types';
import { presentationTiming } from '../timings';

export function createDiceExecutor(
  store: PresentationStoreLike,
  audio: AudioPort = NOOP_AUDIO_PORT,
): PresentationExecutor<RollDicePresentationEvent> {
  return {
    async run(event, context) {
      const durationMs = context.getDuration(presentationTiming.diceRoll);
      store.startDiceRoll(
        { dice1: event.dice1, dice2: event.dice2 },
        event.rollSequence,
        durationMs,
      );
      if (context.reducedMotion) {
        audio.play('dice.impact', { signal: context.signal });
        store.settleDiceRoll(
          { dice1: event.dice1, dice2: event.dice2 },
          event.rollSequence,
        );
        return;
      }
      audio.play('dice.shake', { signal: context.signal });
      await context.waitForDuration(durationMs);
      if (context.signal.aborted || !(context.isCurrent?.() ?? true)) return;
      audio.play('dice.impact', { signal: context.signal });
      store.settleDiceRoll(
        { dice1: event.dice1, dice2: event.dice2 },
        event.rollSequence,
      );
      await context.wait(presentationTiming.diceResultHold);
    },
    finish(event) {
      store.settleDiceRoll(
        { dice1: event.dice1, dice2: event.dice2 },
        event.rollSequence,
      );
    },
  };
}

