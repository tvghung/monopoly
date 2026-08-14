import { useContext, useEffect, useState } from 'react';
import stateContext from '../../internal';
import { formatMoney, getTileName } from '../../presentation';

export default function DebtPanel() {
  const { state, playerId, canMutate, socketFunctions } = useContext(stateContext);
  const [now, setNow] = useState(() => Date.now());
  const claim = state.boardState.paymentShortfall;

  useEffect(() => {
    if (!claim) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [claim]);

  if (!state.loaded || !claim) return null;
  const isMyShortfall = claim.debtorPlayerId === playerId;
  const debtor = state.players[claim.debtorPlayerId];
  const creditor = claim.creditor === 'BANK'
    ? 'Ngân hàng'
    : state.players[claim.creditorPlayerId ?? '']?.name ?? 'người chơi khác';
  const seconds = Math.max(0, Math.ceil((Date.parse(claim.actionDeadlineAt) - now) / 1000));
  const buyers = Object.entries(state.players).filter(([id]) => id !== playerId);

  return (
    <section className="debt-panel" role="alert" aria-labelledby="payment-shortfall-title">
      <h3 id="payment-shortfall-title">Thanh toán thiếu hụt</h3>
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
                  {getTileName(property.tileID)} — tổng giá {formatMoney(property.grossPrice)},
                  {' '}bạn nhận {formatMoney(property.netProceeds)}
                </p>
                <button
                  type="button"
                  onClick={() => socketFunctions.sellPropertyToBank?.({
                    paymentOperationId: claim.paymentOperationId ?? '',
                    claimId: claim.claimId ?? '',
                    tileID: property.tileID,
                  })}
                >Bán cho Ngân hàng</button>
                {buyers.map(([buyerId, buyer]) => (
                  <button
                    key={buyerId}
                    type="button"
                    disabled={buyer.accountBalance < property.grossPrice}
                    onClick={() => socketFunctions.proposeForcedSale?.({
                      paymentOperationId: claim.paymentOperationId ?? '',
                      claimId: claim.claimId ?? '',
                      tileID: property.tileID,
                      buyerPlayerId: buyerId,
                    })}
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
