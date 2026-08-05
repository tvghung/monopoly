import { useContext, useRef } from 'react';
import './style/Dice.css';
import stateContext from '../internal';
import type { Die } from '@monopoly/shared';

const diceFaces: Record<number, Die> = {
  1: ['⚀', 1],
  2: ['⚁', 2],
  3: ['⚂', 3],
  4: ['⚃', 4],
  5: ['⚄', 5],
  6: ['⚅', 6],
};

export default function Dice() {
  const { state, socketFunctions, playerId } = useContext(stateContext);
  const btnRef = useRef<HTMLButtonElement>(null);

  const rollDice = (): Die => {
    const result = Math.floor(Math.random() * 6 + 1);
    return diceFaces[result];
  };

  const clickAndRoll = async () => {
    if (!playerId) return;
    const dice1 = rollDice();
    const dice2 = rollDice();
    if (state.players[playerId].isJail) {
      socketFunctions.inJail({ dice1, dice2 });
    } else {
      if (btnRef.current) btnRef.current.disabled = true;
      socketFunctions.sendDice({ dice1, dice2 });
      const result = dice1[1] + dice2[1];
      for (let i = 0; i < result; i++) {
        await new Promise(resolve => { setTimeout(resolve, 200); });
        socketFunctions.makeMove(1);
      }
      socketFunctions.toggleHasMoved(true);
    }
  };

  const dice = state.boardState.diceValue;
  return (
    <>
      {state.loaded && playerId
        ? (
          <section className="dice">
            {state.boardState.currentPlayer.id === playerId
              ? <button ref={btnRef} className="dice__button" type="button" onClick={clickAndRoll}> Roll Dice</button>
              : <button className="dice__button" type="button" disabled onClick={clickAndRoll}> Roll Dice</button>}
            <h1 className="dice__dices">
              {dice.dice1[0] + dice.dice2[0]}
            </h1>
            <h2 className="dice__result">
              {'Result: '}
              {dice.dice1[1] + dice.dice2[1]}
              <br />
              {dice.dice1[1] === dice.dice2[1] ? <span className="dice__result" role="img" aria-label="emoji">🤩DOUBLE🤩</span> : ''}
            </h2>
          </section>
        )
        : 'loading...'}
    </>
  );
}
