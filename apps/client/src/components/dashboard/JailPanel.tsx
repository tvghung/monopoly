import { useContext } from 'react';
import stateContext from '../../internal';

// Shown to the current player while they're in jail on their own turn: pay bail
// or spend a Get Out Of Jail Free card (they can still roll for a double too).
export default function JailPanel() {
  const {
    state, socketFunctions, playerId, canMutate,
  } = useContext(stateContext);
  const myPlayer = typeof playerId === 'string' ? state.players[playerId] : undefined;

  if (!canMutate
    || !state.loaded
    || state.boardState.currentPlayer.id !== playerId
    || !myPlayer?.isJail) {
    return null;
  }

  return (
    <section className="jail-panel">
      <h3 className="jail-panel__title">You're in jail!</h3>
      <p className="jail-panel__hint">Roll a double to escape, or:</p>
      <div className="jail-panel__actions">
        <button
          className="button__purchase--yes"
          type="button"
          disabled={myPlayer.accountBalance < 50}
          onClick={() => socketFunctions.payBail()}
        >
          Pay $50M bail
        </button>
        {myPlayer.getOutOfJailCards > 0
          ? (
            <button
              className="button__purchase--yes"
              type="button"
              onClick={() => socketFunctions.useJailCard()}
            >
              {`Use jail card (${myPlayer.getOutOfJailCards})`}
            </button>
          )
          : null}
      </div>
    </section>
  );
}
