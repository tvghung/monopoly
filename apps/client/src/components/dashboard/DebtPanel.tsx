import { useContext, useEffect, useState } from 'react';
import type { Ack, PublicGameState } from '@monopoly/shared';
import stateContext from '../../internal';
import { formatMoney, getTileName, localizeAckError } from '../../presentation';

type DebtClaimProjection = NonNullable<PublicGameState['boardState']['paymentShortfall']>;

interface PendingDebtAction {
  key: string;
  initialProjectionKey: string | null;
  ackResolved: boolean;
  projectionAdvanced: boolean;
  awaitingProposal: boolean;
}

function getDebtProjectionKey(claim: DebtClaimProjection): string {
  return [
    claim.paymentOperationId ?? '',
    claim.claimId ?? '',
    claim.debtorPlayerId,
    claim.creditor,
    claim.creditorPlayerId ?? '',
    claim.amount,
    claim.remainingAmount,
    claim.remainingClaimCount,
    claim.actionDeadlineAt,
    JSON.stringify(claim.source),
    (claim.sellableProperties ?? [])
      .map(property => `${property.tileID}:${property.grossPrice}:${property.houses}`)
      .sort()
      .join(','),
  ].join('|');
}

export default function DebtPanel() {
  const {
    state, playerId, canMutate, socketFunctions, connected, privatePlayerState,
  } = useContext(stateContext);
  const [now, setNow] = useState(() => Date.now());
  const claim = state.boardState.paymentShortfall;
  const isMyShortfall = claim?.debtorPlayerId === playerId;
  const claimProjectionKey = claim ? getDebtProjectionKey(claim) : null;
  const forcedSaleProposal = privatePlayerState?.forcedSaleProposal ?? null;
  const forcedSaleActive = Boolean(forcedSaleProposal && forcedSaleProposal.sellerPlayerId === playerId);
  const [pendingAction, setPendingAction] = useState<PendingDebtAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!claim) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [claim]);

  useEffect(() => {
    if (canMutate && connected && isMyShortfall) return;
    setPendingAction(null);
    setError(null);
  }, [canMutate, connected, isMyShortfall]);

  useEffect(() => {
    setPendingAction(current => {
      if (!current || current.initialProjectionKey === claimProjectionKey) return current;
      return current.ackResolved ? null : { ...current, projectionAdvanced: true };
    });
  }, [claimProjectionKey]);

  useEffect(() => {
    if (!forcedSaleActive || !pendingAction?.awaitingProposal || !pendingAction.ackResolved) return;
    setPendingAction(null);
  }, [forcedSaleActive, pendingAction]);

  const submit = (key: string, command?: () => void | Promise<Ack>) => {
    if (pendingAction || forcedSaleActive || !command) return;
    setPendingAction({
      key,
      initialProjectionKey: claimProjectionKey,
      ackResolved: false,
      projectionAdvanced: false,
      awaitingProposal: key.startsWith('forced:'),
    });
    setError(null);
    void (async () => {
      try {
        const response = await command();
        if (!response || response.ok) {
          setPendingAction(current => {
            if (!current || current.key !== key) return current;
            if (current.awaitingProposal && forcedSaleActive) return null;
            return current.projectionAdvanced ? null : { ...current, ackResolved: true };
          });
          return;
        }
        setPendingAction(null);
        setError(localizeAckError(response.error));
      } catch {
        setPendingAction(null);
        setError('Không thể gửi thao tác. Vui lòng thử lại.');
      }
    })();
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
      {forcedSaleActive
        ? <p role="status">Đang chờ xử lý đề nghị bán bắt buộc.</p>
        : null}
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
                  disabled={pendingAction !== null || forcedSaleActive}
                  aria-busy={pendingAction?.key === `bank:${property.tileID}`}
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
                    disabled={pendingAction !== null || forcedSaleActive || buyer.accountBalance < property.grossPrice}
                    aria-busy={pendingAction?.key === `forced:${property.tileID}:${buyerId}`}
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
