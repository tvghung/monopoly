import type { CSSProperties } from 'react';
import type { DiceRenderModel } from '../../game/scene/board/boardRenderModel';
import './LegacyDiceOverlay.css';

function isValidDiceValue(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}

export default function LegacyDiceOverlay({ model }: { model: DiceRenderModel }) {
  const { dice } = model;
  if (
    model.rollSequence <= 0
    || model.phase === 'HIDDEN'
    || !isValidDiceValue(dice.dice1)
    || !isValidDiceValue(dice.dice2)
  ) {
    return null;
  }

  const isRolling = model.phase === 'ROLLING';
  const total = dice.dice1 + dice.dice2;
  return (
    <aside
      className={`legacy-dice-overlay${isRolling ? ' legacy-dice-overlay--rolling' : ' legacy-dice-overlay--settled'}`}
      aria-label="Kết quả đổ xúc xắc"
      data-roll-sequence={model.rollSequence}
      data-dice-phase={model.phase}
      style={{ '--legacy-dice-duration': `${Math.max(0, model.durationMs)}ms` } as CSSProperties}
    >
      <div className="legacy-dice-overlay__dice" aria-hidden="true">
        <span className="legacy-dice-overlay__die">{dice.dice1}</span>
        <span className="legacy-dice-overlay__die">{dice.dice2}</span>
      </div>
      {isRolling ? null : <strong className="legacy-dice-overlay__total">Tổng {total}</strong>}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {isRolling
          ? `Đang trình bày kết quả ${dice.dice1} và ${dice.dice2}.`
          : `Kết quả đổ xúc xắc: ${dice.dice1} + ${dice.dice2} = ${total}.`}
      </span>
    </aside>
  );
}
