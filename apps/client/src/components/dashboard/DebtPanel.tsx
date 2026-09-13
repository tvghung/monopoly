import { useContext, useEffect, useState } from 'react';
import type { Ack, PublicGameState } from '@monopoly/shared';
import { Handshake, Landmark } from 'lucide-react';
import stateContext from '../../internal';
import { formatMoney, getTileName, localizeAckError } from '../../presentation';
import Modal from '../../design-system/components/Modal/Modal';

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
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const [selectedBuyerId, setSelectedBuyerId] = useState<string | null>(null);
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
    setSelectedTileId(null);
    setSelectedBuyerId(null);
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
  const properties = claim.sellableProperties ?? [];
  const selectedProperty = properties.find(property => property.tileID === selectedTileId);
  const selectedBuyer = buyers.find(([buyerId]) => buyerId === selectedBuyerId);

  if (!isMyShortfall || !canMutate) {
    return (
      <section className="debt-panel debt-panel--status" role="status">
        <strong>{debtor?.name ?? 'Người chơi'} đang xử lý khoản thiếu {formatMoney(claim.remainingAmount)}.</strong>
        <span>{seconds} giây còn lại</span>
      </section>
    );
  }

  if (forcedSaleActive) return null;

  return (
    <Modal open title="Cần thanh toán" role="alertdialog" className="debt-panel-modal">
      <div className="debt-panel__summary">
        <strong>{formatMoney(claim.remainingAmount)}</strong>
        <span>Trả cho {creditor}</span>
        <span>{seconds} giây còn lại</span>
      </div>
      {error ? <p className="debt-panel__error" role="alert">{error}</p> : null}
      {pendingAction
        ? (
          <p className="debt-panel__pending" role="status">
            {pendingAction.ackResolved ? 'Đã xác nhận. Đang cập nhật khoản nợ…' : 'Đang gửi yêu cầu…'}
          </p>
        )
        : null}
      <div className="debt-panel__properties">
        {properties.map((property, index) => {
          const propertyName = getTileName(property.tileID);
          const development = property.houses === 5
            ? '1 Khách sạn'
            : property.houses > 0 ? `${property.houses} Nhà` : 'Chưa xây';
          const choosingBuyer = selectedTileId === property.tileID;
          return (
            <article key={property.tileID} className="debt-panel__property">
              <div className="debt-panel__property-copy">
                <strong>{propertyName}</strong>
                <span>{development} · Nhận {formatMoney(property.grossPrice)}</span>
              </div>
              <div className="debt-panel__property-actions">
                <button
                  data-modal-autofocus={index === 0 ? true : undefined}
                  className="debt-panel__icon-action"
                  type="button"
                  aria-label={`Bán ${propertyName} cho Ngân hàng`}
                  title={`Bán ${propertyName} cho Ngân hàng`}
                  disabled={pendingAction !== null || forcedSaleActive}
                  aria-busy={pendingAction?.key === `bank:${property.tileID}`}
                  onClick={() => submit(`bank:${property.tileID}`, () => socketFunctions.sellPropertyToBank?.({
                    paymentOperationId: claim.paymentOperationId ?? '',
                    claimId: claim.claimId ?? '',
                    tileID: property.tileID,
                  }))}
                ><Landmark className="action-icon action-icon--only" aria-hidden="true" /></button>
                <button
                  className="debt-panel__icon-action"
                  type="button"
                  aria-label={`Đề nghị người chơi mua ${propertyName}`}
                  title={`Đề nghị người chơi mua ${propertyName}`}
                  aria-pressed={choosingBuyer}
                  disabled={pendingAction !== null || forcedSaleActive || buyers.length === 0}
                  onClick={() => {
                    setSelectedTileId(choosingBuyer ? null : property.tileID);
                    setSelectedBuyerId(null);
                  }}
                ><Handshake className="action-icon action-icon--only" aria-hidden="true" /></button>
              </div>
              {choosingBuyer
                ? (
                  <fieldset className="debt-panel__buyer-picker">
                    <legend>Chọn người mua</legend>
                    {buyers.map(([buyerId, buyer]) => {
                      const affordable = buyer.accountBalance >= property.grossPrice;
                      return (
                        <label key={buyerId} className="debt-panel__buyer">
                          <input
                            type="radio"
                            name={`buyer-${property.tileID}`}
                            value={buyerId}
                            checked={selectedBuyerId === buyerId}
                            disabled={!affordable || pendingAction !== null}
                            onChange={() => setSelectedBuyerId(buyerId)}
                          />
                          <span>{buyer.name}</span>
                          <small>{affordable ? formatMoney(buyer.accountBalance) : 'Không đủ tiền'}</small>
                        </label>
                      );
                    })}
                    <button
                      className="debt-panel__send"
                      type="button"
                      disabled={!selectedBuyer || !selectedProperty || selectedBuyer[1].accountBalance < selectedProperty.grossPrice || pendingAction !== null}
                      aria-busy={pendingAction?.key === `forced:${property.tileID}:${selectedBuyerId ?? ''}`}
                      onClick={() => {
                        if (!selectedBuyerId) return;
                        submit(`forced:${property.tileID}:${selectedBuyerId}`, () => socketFunctions.proposeForcedSale?.({
                          paymentOperationId: claim.paymentOperationId ?? '',
                          claimId: claim.claimId ?? '',
                          tileID: property.tileID,
                          buyerPlayerId: selectedBuyerId,
                        }));
                      }}
                    >Gửi đề nghị bán</button>
                  </fieldset>
                )
                : null}
              </article>
          );
        })}
      </div>
    </Modal>
  );
}
