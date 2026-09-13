import { useContext, useEffect, useState } from 'react';
import { BAIL_AMOUNT, type Ack } from '@monopoly/shared';
import { TicketCheck, Unlock } from 'lucide-react';
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
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPendingAction(null);
    setAcknowledged(false);
    setError(null);
  }, [canMutate, connected, myPlayer?.accountBalance, myPlayer?.getOutOfJailCardCount, myPlayer?.isJail, playerId, state.boardState.currentPlayer.id, visible]);

  const submit = (action: string, command?: () => void | Promise<Ack>) => {
    if (pendingAction || !command) return;
    setPendingAction(action);
    setAcknowledged(false);
    setError(null);
    void Promise.resolve(command())
      .then(response => {
        if (!response || response.ok) {
          setAcknowledged(true);
          return;
        }
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
      <p className="jail-panel__hint">Chọn một cách ra tù, hoặc bấm Chơi để thử đổ đôi.</p>
      <p className="jail-panel__rounds">Vòng chờ: {myPlayer.jailOpponentRoundsElapsed}/2</p>
      {myPlayer.accountBalance < BAIL_AMOUNT
        ? <p className="jail-panel__balance-warning">Cần {formatMoney(BAIL_AMOUNT)} để trả bảo lãnh.</p>
        : null}
      {acknowledged ? <p className="jail-panel__pending">Đã xác nhận. Đang cập nhật ván chơi…</p> : null}
      <div className="jail-panel__actions">
        <button
          className="button__purchase--yes"
          type="button"
          disabled={pendingAction !== null || myPlayer.accountBalance < BAIL_AMOUNT}
          aria-busy={pendingAction === 'PAY_BAIL'}
          onClick={() => submit('PAY_BAIL', () => socketFunctions.payBail())}
        >
          <Unlock className="action-icon" aria-hidden="true" />
          {pendingAction === 'PAY_BAIL'
            ? acknowledged ? 'Đang cập nhật…' : 'Đang gửi…'
            : `Trả ${formatMoney(BAIL_AMOUNT)}`}
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
              {pendingAction === 'USE_CARD'
                ? acknowledged ? 'Đang cập nhật…' : 'Đang gửi…'
                : `Dùng thẻ Thoát Tù Miễn Phí (${myPlayer.getOutOfJailCardCount})`}
            </button>
          )
          : null}
      </div>
    </section>
  );
}
