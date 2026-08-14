import { useContext } from 'react';
import stateContext from '../../internal';
import { formatMoney } from '../../presentation';

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
    <section className="jail-panel" role="status" aria-live="polite">
      <h3 className="jail-panel__title">Bạn đang ở Nhà Tù</h3>
      <p className="jail-panel__hint">Hãy đổ đôi để thoát, hoặc chọn một cách sau:</p>
      <p aria-live="polite">Vòng đối thủ đã trôi qua: {(myPlayer.jailOpponentRoundsElapsed ?? myPlayer.jailRounds ?? 0)}/2</p>
      <div className="jail-panel__actions">
        <button
          className="button__purchase--yes"
          type="button"
          disabled={myPlayer.accountBalance < 50}
          onClick={() => socketFunctions.payBail()}
        >
          Trả {formatMoney(50)} tiền bảo lãnh
        </button>
        {myPlayer.getOutOfJailCardCount > 0
          ? (
            <button
              className="button__purchase--yes"
              type="button"
              onClick={() => socketFunctions.useJailCard()}
            >
              {`Dùng thẻ Thoát Tù Miễn Phí (${myPlayer.getOutOfJailCardCount})`}
            </button>
          )
          : null}
        <button type="button" onClick={() => socketFunctions.waitInJail?.()}>
          Chờ hết lượt trong tù
        </button>
      </div>
    </section>
  );
}
