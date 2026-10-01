import { useContext, useEffect, useState } from 'react';
import { BAIL_AMOUNT, type Ack } from '@monopoly/shared';
import stateContext from '../../internal';
import { formatMoney, localizeAckError } from '../../presentation';
import Button from '../../design-system/components/Button/Button';
import Chip from '../../design-system/components/Chip/Chip';
import { ActionIcon } from '../../design-system/icons/ActionIcon';
import { JAIL_ROUND_LIMIT } from '../../game/ui/hud/playerCardText';
import './JailPanel.css';

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
      <div className="jail-panel__head">
        <span className="jail-panel__icon" aria-hidden="true"><ActionIcon name="jail" /></span>
        <h3 className="jail-panel__title">Bạn đang ở Nhà Tù</h3>
        <Chip tone="loss" className="jail-panel__rounds">
          {`Vòng chờ: ${myPlayer.jailOpponentRoundsElapsed}/${JAIL_ROUND_LIMIT}`}
        </Chip>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <p className="jail-panel__hint">Chọn một cách ra tù, hoặc bấm Đổ xúc xắc để thử đổ đôi.</p>
      {myPlayer.accountBalance < BAIL_AMOUNT
        ? <p className="jail-panel__balance-warning">Cần {formatMoney(BAIL_AMOUNT)} để trả bảo lãnh.</p>
        : null}
      {acknowledged ? <p className="jail-panel__pending">Đã xác nhận. Đang cập nhật ván chơi…</p> : null}
      <div className="jail-panel__actions">
        <Button
          variant="secondary"
          icon={<ActionIcon name="bail" />}
          busy={pendingAction === 'PAY_BAIL'}
          disabled={pendingAction !== null || myPlayer.accountBalance < BAIL_AMOUNT}
          onClick={() => submit('PAY_BAIL', () => socketFunctions.payBail())}
        >
          {pendingAction === 'PAY_BAIL'
            ? acknowledged ? 'Đang cập nhật…' : 'Đang gửi…'
            : `Trả ${formatMoney(BAIL_AMOUNT)}`}
        </Button>
        {myPlayer.getOutOfJailCardCount > 0
          ? (
            <Button
              variant="secondary"
              icon={<ActionIcon name="jailCard" />}
              busy={pendingAction === 'USE_CARD'}
              disabled={pendingAction !== null}
              onClick={() => submit('USE_CARD', () => socketFunctions.useJailCard())}
            >
              {pendingAction === 'USE_CARD'
                ? acknowledged ? 'Đang cập nhật…' : 'Đang gửi…'
                : `Dùng thẻ Thoát Tù Miễn Phí (${myPlayer.getOutOfJailCardCount})`}
            </Button>
          )
          : null}
      </div>
    </section>
  );
}
