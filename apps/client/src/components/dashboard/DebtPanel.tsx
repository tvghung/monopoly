import { useContext, useEffect, useState } from 'react';
import type { Ack } from '@monopoly/shared';
import stateContext from '../../internal';
import { formatMoney, getTileName, localizeAckError } from '../../presentation';

export default function DebtPanel() {
  const {
    state, playerId, canMutate, socketFunctions, connected,
  } = useContext(stateContext);
  const [now, setNow] = useState(() => Date.now());
  const claim = state.boardState.paymentShortfall;
  const isMyShortfall = claim?.debtorPlayerId === playerId;
  const claimKey = claim ? `${claim.paymentOperationId ?? ''}:${claim.claimId ?? ''}` : null;
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!claim) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [claim]);

  useEffect(() => {
    setPendingAction(null);
    setError(null);
  }, [canMutate, claimKey, connected, isMyShortfall]);

  const submit = (key: string, command?: () => void | Promise<Ack>) => {
    if (pendingAction || !command) return;
    setPendingAction(key);
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

  if (!state.loaded || !claim) return null;
  const debtor = state.players[claim.debtorPlayerId];
  const creditor = claim.creditor === 'BANK'
    ? 'Ngân hàng'
    : state.players[claim.creditorPlayerId ?? '']?.name ?? 'người chơi khác';
  const seconds = Math.max(0, Math.ceil((Date.parse(claim.actionDeadlineAt) - now) / 1000));
  const buyers = Object.entries(state.players).filter(([id]) => id !== playerId);

  return (
    <section className="debt-panel" role="alert" aria-labelledby="payment-shortfall-title">
      <h3 id="payment-shortfall-title">Thanh toán thiếu hụt</h3>
      {error ? <p>{error}</p> : null}
      <p>
        <strong>{debtor?.name ?? 'Người chơi'}</strong>
        {` cần trả ${formatMoney(claim.remainingAmount)} cho ${creditor}.`}
      </p>
      <p>{`Còn ${seconds} giây để bán tài sản bắt buộc.`}</p>
      {isMyShortfall && canMutate
        ? (
          <div className="debt-panel__actions">
            {(claim.sellableProperties ?? []).map(property => (
              <article key={property.tileID} className="debt-panel__property">
                <p>
                  {getTileName(property.tileID)}, tổng giá {formatMoney(property.grossPrice)},
                  {' '}bạn nhận {formatMoney(property.grossPrice)}
                </p>
                <button
                  type="button"
                  disabled={pendingAction !== null}
                  aria-busy={pendingAction === `bank:${property.tileID}`}
                  onClick={() => submit(`bank:${property.tileID}`, () => socketFunctions.sellPropertyToBank?.({
                    paymentOperationId: claim.paymentOperationId ?? '',
                    claimId: claim.claimId ?? '',
                    tileID: property.tileID,
                  }))}
                >Bán cho Ngân hàng</button>
                {buyers.map(([buyerId, buyer]) => (
                  <button
                    key={buyerId}
                    type="button"
                    disabled={pendingAction !== null || buyer.accountBalance < property.grossPrice}
                    aria-busy={pendingAction === `forced:${property.tileID}:${buyerId}`}
                    onClick={() => submit(`forced:${property.tileID}:${buyerId}`, () => socketFunctions.proposeForcedSale?.({
                      paymentOperationId: claim.paymentOperationId ?? '',
                      claimId: claim.claimId ?? '',
                      tileID: property.tileID,
                      buyerPlayerId: buyerId,
                    }))}
                  >{`Đề nghị ${buyer.name} mua`}</button>
                ))}
              </article>
            ))}
          </div>
        )
        : null}
    </section>
  );
}
