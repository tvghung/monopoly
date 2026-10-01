import { useContext, useEffect, useState } from 'react';
import type { PublicGameState } from '@monopoly/shared';
import stateContext from '../../internal';
import type { PresentationState } from '../../game/presentation/store/types';
import { usePresentationSelector } from '../../game/presentation/usePresentationSelector';

/** A winner whose queue never reports idle is shown anyway after this long, so the screen can never stay hidden. */
export const VICTORY_FALLBACK_MS = 8_000;

export interface VictoryVisibility {
  /** The victory screen may be on screen. */
  visible: boolean;
  /** It appeared through a live update, after the final animations: the one case that gets a confetti burst. */
  celebrate: boolean;
}

type Phase =
  | { step: 'none' }
  /** A live winner while the queue is busy; `epoch` is the reset epoch it arrived in. */
  | { step: 'waiting'; epoch: number }
  | { step: 'shown'; celebrate: boolean };

interface Tracker {
  /** The room state rendered last and the reset epoch that was current when it was first rendered. */
  state: PublicGameState;
  epoch: number;
  phase: Phase;
}

interface Input {
  state: PublicGameState;
  epoch: number;
  status: PresentationState['status'];
  /** An authoritative winner of a finished room. */
  active: boolean;
}

const NO_VICTORY: Phase = { step: 'none' };

const selectStatus = (presentation: PresentationState) => presentation.status;
const selectEpoch = (presentation: PresentationState) => presentation.presentationResetEpoch;

/**
 * Pure transition of the victory gate: a winner that is already there (first render, or a snapshot that carried it) is
 * shown at once; one that arrives in a live update waits for the presentation queue to go idle so the final bankruptcy
 * and coin animations are not covered; a snapshot while waiting shows it at once. Once shown it stays until the winner
 * or the finished room is gone. Returns `tracker` itself when nothing changed.
 */
function advance(tracker: Tracker, { state, epoch, status, active }: Input): Tracker {
  // A snapshot raises the epoch in the store one render before the room state carrying it reaches this component,
  // so the epoch is compared with the one the previous room state was rendered at, not with the previous render's.
  const snapshotArrived = epoch !== tracker.epoch;
  let phase = tracker.phase;
  if (!active) {
    phase = NO_VICTORY;
  } else if (phase.step === 'none') {
    phase = status === 'idle' || snapshotArrived
      ? { step: 'shown', celebrate: !snapshotArrived }
      : { step: 'waiting', epoch };
  } else if (phase.step === 'waiting' && (status === 'idle' || epoch !== phase.epoch)) {
    phase = { step: 'shown', celebrate: epoch === phase.epoch };
  }
  if (phase === tracker.phase && state === tracker.state) return tracker;
  return { state, epoch: state === tracker.state ? tracker.epoch : epoch, phase };
}

/**
 * When the victory screen may appear (plan 04 OD-04-5). The winner itself always comes from authoritative state; this
 * only decides the moment, and whether that moment is a live one worth celebrating.
 */
export default function useVictoryVisibility(): VictoryVisibility {
  const { state, roomStatus } = useContext(stateContext);
  const status = usePresentationSelector(selectStatus);
  const epoch = usePresentationSelector(selectEpoch);
  const active = state.loaded && state.boardState.winner !== null
    && (roomStatus === undefined || roomStatus === 'FINISHED');
  const input: Input = { state, epoch, status, active };

  const [tracker, setTracker] = useState<Tracker>(() => ({
    state,
    epoch,
    phase: active ? { step: 'shown', celebrate: false } : NO_VICTORY,
  }));
  const next = advance(tracker, input);
  if (next !== tracker) setTracker(next);

  const waiting = next.phase.step === 'waiting';
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = window.setTimeout(() => {
      setTracker(current => current.phase.step === 'waiting'
        ? { ...current, phase: { step: 'shown', celebrate: true } }
        : current);
    }, VICTORY_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [waiting]);

  return {
    visible: next.phase.step === 'shown',
    celebrate: next.phase.step === 'shown' && next.phase.celebrate,
  };
}
