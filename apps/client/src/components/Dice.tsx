import {
  useContext, useEffect, useRef, useState,
} from 'react';
import './style/Dice.css';
import stateContext from '../internal';
import displayPositionsContext from '../displayPositionsContext';
import { useEffectiveReducedMotion } from '../settings/selectors';
import { usePresentation } from '../game/presentation/PresentationProvider';

// Cube rotation (degrees) needed to bring a given face value to the front.
const faceRotation: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
  5: { x: 0, y: 90 },
  6: { x: 0, y: 180 },
};

// Pip layout per face, as [row, column] cells in a 3x3 grid.
const pipPositions: Record<number, [number, number][]> = {
  0: [],
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [1, 3], [3, 1], [3, 3]],
  5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
  6: [[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]],
};

const faceValues = [1, 2, 3, 4, 5, 6];

interface DieCubeProps {
  value: number;
  spins: number;
  reduced: boolean;
}

function DieCube({ value, spins, reduced }: DieCubeProps) {
  const base = faceRotation[value] ?? faceRotation[1];
  // Extra full turns give the tumble; reduced motion snaps straight to the face.
  const extra = reduced ? 0 : spins * 360;
  const cubeStyle = {
    transform: `rotateX(${base.x + extra}deg) rotateY(${base.y + extra}deg)`,
    transition: reduced ? 'none' : undefined,
  };
  return (
    <div className="die" aria-hidden="true">
      <div className="die__cube" style={cubeStyle}>
        {faceValues.map(face => (
          <div key={face} className={`die__face die__face--${face}`}>
            {pipPositions[face].map(([row, column]) => (
              <span
                key={`${row}-${column}`}
                className="die__pip"
                style={{ gridRow: row, gridColumn: column }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dice() {
  const {
    state, socketFunctions, playerId, canMutate,
  } = useContext(stateContext);
  const displayPositions = useContext(displayPositionsContext);
  const reduced = useEffectiveReducedMotion();
  const { state: presentationState } = usePresentation();

  // Hold off rolling until every token has finished its stepped walk, so the next
  // player can't start moving while the previous token is still travelling.
  const tokensSettled = Object.keys(state.players).every(
    id => (displayPositions[id] ?? state.players[id].currentTile) === state.players[id].currentTile,
  );

  // The server owns the dice now: rolling, movement and tile resolution all
  // happen server-side, so the client only asks to roll on its turn.
  const isMyTurn = state.boardState.currentPlayer.id === playerId;
  const canRoll = canMutate
    && isMyTurn
    && !state.boardState.currentPlayer.hasMoved
    && tokensSettled
    && presentationState.status === 'idle';

  const authoritativeDice = state.boardState.diceValue;
  const dice = presentationState.displayDice.dice1 > 0 || presentationState.displayDice.dice2 > 0
    ? presentationState.displayDice
    : authoritativeDice;
  const first = dice.dice1;
  const second = dice.dice2;

  // Bump a spin counter whenever a new roll arrives so the cubes always tumble,
  // even when the same total (or same face) comes up twice in a row.
  const [spins, setSpins] = useState(0);
  const previous = useRef('');
  useEffect(() => {
    const key = `${first}-${second}`;
    if (key !== previous.current) {
      previous.current = key;
      if (first > 0 || second > 0) setSpins(count => count + 1);
    }
  }, [first, second]);

  return (
    <>
      {state.loaded
        ? (
          <section className="dice">
            <button
              className="dice__button"
              type="button"
              disabled={!canRoll}
              onClick={() => socketFunctions.rollDice()}
            >
              Đổ Xúc Xắc
            </button>
            <div className="dice__cubes">
              <DieCube value={first} spins={spins} reduced={reduced} />
              <DieCube value={second} spins={spins + 1} reduced={reduced} />
            </div>
            <h2 className="dice__result" role="status" aria-live="polite" aria-atomic="true">
              {'Kết quả: '}
              {first > 0 || second > 0 ? `${first} + ${second} = ${first + second}` : 'chưa đổ'}
            </h2>
          </section>
        )
        : 'Đang tải…'}
    </>
  );
}
