import { useContext, useEffect, useState } from 'react';
import type { Ack } from '@monopoly/shared';
import { Clock, TicketCheck, Unlock } from 'lucide-react';
import stateContext from '../../internal';
import { formatMoney, localizeAckError } from '../../presentation';

// Shown to the current player while they're in jail on their own turn: pay bail
// or spend a Get Out Of Jail Free card (they can still roll for a double too).
export default function JailPanel() {
  const {
    state, socketFunctions, playerId, canMutate, connected,
  } = useContext(stateContext);
  const myPlayer = typeof playerId === 'string' ? state.players[playerId] : undefined;
  const visible = canMutate
    && state.loaded
    && state.boardState.currentPlayer.id === playerId
    && Boolean(myPlayer?.isJail);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPendingAction(null);
    setError(null);
  }, [canMutate, connected, myPlayer?.accountBalance, myPlayer?.getOutOfJailCardCount, myPlayer?.isJail, playerId, state.boardState.currentPlayer.id, visible]);

  const submit = (action: string, command?: () => void | Promise<Ack>) => {
    if (pendingAction || !command) return;
    setPendingAction(action);
    setError(null);
    void Promise.resolve(command())
      .then(response => {
        if (!response || response.ok) return;
        setPendingAction(null);
        setError(localizeAckError(response.error));
      })
      .catch(() => {
        setPendingAction(null);
        setError('Không thể gửi thao tác. Vui lòng thử lại.');
      });
  };

  if (!visible || !myPlayer) return null;

  return (
    <section className="jail-panel" role="status" aria-live="polite">
      <h3 className="jail-panel__title">Bạn đang ở Nhà Tù</h3>
      {error ? <p role="alert">{error}</p> : null}
      <p className="jail-panel__hint">Hãy đổ đôi để thoát, hoặc chọn một cách sau:</p>
      <p aria-live="polite">Vòng đối thủ đã trôi qua: {myPlayer.jailOpponentRoundsElapsed}/2</p>
      <div className="jail-panel__actions">
        <button
          className="button__purchase--yes"
          type="button"
          disabled={pendingAction !== null || myPlayer.accountBalance < 50}
          aria-busy={pendingAction === 'PAY_BAIL'}
          onClick={() => submit('PAY_BAIL', () => socketFunctions.payBail())}
        >
          <Unlock className="action-icon" aria-hidden="true" />Trả {formatMoney(50)} tiền bảo lãnh
        </button>
        {myPlayer.getOutOfJailCardCount > 0
          ? (
            <button
              className="button__purchase--yes"
              type="button"
              disabled={pendingAction !== null}
              aria-busy={pendingAction === 'USE_CARD'}
              onClick={() => submit('USE_CARD', () => socketFunctions.useJailCard())}
            >
              <TicketCheck className="action-icon" aria-hidden="true" />
              {`Dùng thẻ Thoát Tù Miễn Phí (${myPlayer.getOutOfJailCardCount})`}
            </button>
          )
          : null}
        <button
          type="button"
          disabled={pendingAction !== null}
          aria-busy={pendingAction === 'WAIT'}
          onClick={() => submit('WAIT', () => socketFunctions.waitInJail?.())}
        >
          <Clock className="action-icon" aria-hidden="true" />Chờ hết lượt trong tù
        </button>
      </div>
    </section>
  );
}
