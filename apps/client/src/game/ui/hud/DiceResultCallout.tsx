import { useEffect, useRef } from 'react';
import type { DiceValue } from '@monopoly/shared';
import Chip from '../../../design-system/components/Chip/Chip';
import { usePresentationSelector } from '../../presentation/usePresentationSelector';
import type { PresentationState } from '../../presentation/store/types';
import { useTransientList } from './useTransientList';

/** The callout stays this long at speed 1 (divided by the animation speed). */
export const DICE_CALLOUT_LIFETIME_MS = 1200;

interface CalloutValue {
  dice: DiceValue;
  total: number;
  doubles: boolean;
  sequence: number;
}

const selectDiceSlice = (state: PresentationState) => ({
  displayRollSequence: state.displayRollSequence,
  displayDice: state.displayDice,
  rolling: state.diceRoll !== null,
  resetEpoch: state.presentationResetEpoch,
  speed: state.animationSpeedMultiplier,
});
type DiceSlice = ReturnType<typeof selectDiceSlice>;
const sameDiceSlice = (previous: DiceSlice, next: DiceSlice) => previous.displayRollSequence === next.displayRollSequence
  && previous.displayDice === next.displayDice
  && previous.rolling === next.rolling
  && previous.resetEpoch === next.resetEpoch
  && previous.speed === next.speed;

function isDie(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}

/** Pips of a die face in a 3x3 grid, as cell indexes 0 to 8. */
const PIP_CELLS: Record<number, readonly number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function DieGlyph({ value }: { value: number }) {
  const pips = new Set(PIP_CELLS[value] ?? []);
  return (
    <span className="dice-callout__die" aria-hidden="true">
      {Array.from({ length: 9 }, (_, cell) => (
        <span key={cell} className={pips.has(cell) ? 'dice-callout__pip dice-callout__pip--on' : 'dice-callout__pip'} />
      ))}
    </span>
  );
}

/**
 * The big "4 + 3 = 7" next to the dice. It appears once per live roll, when the displayed roll sequence advances and
 * the dice have settled; it never appears after a snap or a reset (a changed presentation reset epoch), because those
 * hand over a finished roll. It is decorative: the roll control's live region already announces the result.
 */
export default function DiceResultCallout() {
  const slice = usePresentationSelector(selectDiceSlice, sameDiceSlice);
  const list = useTransientList<CalloutValue>(1);
  const seenSequence = useRef<number | null>(null);
  const seenEpoch = useRef(slice.resetEpoch);
  const { push, clear } = list;

  useEffect(() => {
    if (seenSequence.current === null || seenEpoch.current !== slice.resetEpoch) {
      seenSequence.current = slice.displayRollSequence;
      seenEpoch.current = slice.resetEpoch;
      clear();
      return;
    }
    if (slice.displayRollSequence <= seenSequence.current) {
      // A lower sequence means the store restarted: forget the old roll without showing anything.
      if (slice.displayRollSequence < seenSequence.current) seenSequence.current = slice.displayRollSequence;
      return;
    }
    seenSequence.current = slice.displayRollSequence;
    if (slice.rolling || !isDie(slice.displayDice.dice1) || !isDie(slice.displayDice.dice2)) return;
    const { dice1, dice2 } = slice.displayDice;
    push(
      `roll-${slice.displayRollSequence}`,
      { dice: slice.displayDice, total: dice1 + dice2, doubles: dice1 === dice2, sequence: slice.displayRollSequence },
      DICE_CALLOUT_LIFETIME_MS / Math.max(0.1, slice.speed),
    );
  }, [clear, push, slice]);

  const entry = list.entries.at(-1);
  if (!entry) return null;
  const { dice, total, doubles } = entry.value;
  return (
    <div className="dice-callout" data-hud-region="dice-callout" aria-hidden="true" key={entry.key}>
      <span className="dice-callout__sum">
        <DieGlyph value={dice.dice1} />
        <span className="dice-callout__plus">+</span>
        <DieGlyph value={dice.dice2} />
      </span>
      <span className="dice-callout__total">{total}</span>
      {doubles ? <Chip tone="gold" className="dice-callout__doubles">Đổ đôi</Chip> : null}
    </div>
  );
}
