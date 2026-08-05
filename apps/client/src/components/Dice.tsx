import { useContext } from 'react';
import './style/Dice.css';
import stateContext from '../internal';

export default function Dice() {
  const { state, socketFunctions, playerId } = useContext(stateContext);

  // The server owns the dice now: rolling, movement and tile resolution all
  // happen server-side, so the client only asks to roll on its turn.
  const isMyTurn = state.boardState.currentPlayer.id === playerId;
  const canRoll = isMyTurn && !state.boardState.currentPlayer.hasMoved;

  const dice = state.boardState.diceValue;
  return (
    <>
      {state.loaded && playerId
        ? (
          <section className="dice">
            <button
              className="dice__button"
              type="button"
              disabled={!canRoll}
              onClick={() => socketFunctions.rollDice()}
            >
              {' '}
              Roll Dice
            </button>
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
