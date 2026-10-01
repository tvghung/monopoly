import { useContext, useEffect, useMemo, useState } from 'react';
import { gameCardsById } from '@monopoly/shared';
import type { Ack, PublicGameState } from '@monopoly/shared';
import stateContext from '../../internal';
import { formatMoney, getTileName, localizeAckError } from '../../presentation';
import { useRoomExit } from '../../roomExitContext';
import Modal from '../../design-system/components/Modal/Modal';
import Button from '../../design-system/components/Button/Button';
import Chip from '../../design-system/components/Chip/Chip';
import PlayerAvatar from '../../design-system/components/PlayerAvatar/PlayerAvatar';
import { ActionIcon } from '../../design-system/icons/ActionIcon';
import { buildDeedCardModel, type DeedCardModel } from '../../game/ui/property/deedCardModel';
import PropertyDeedCard from '../../game/ui/property/PropertyDeedCard';
import './DebtPanel.css';

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

/** What the debt is for, as one short line above the title ("Tiền thuê Cà Mau"). */
function describeDebtSource(source: DebtClaimProjection['source']): string {
  if (source.kind === 'RENT') return `Tiền thuê ${getTileName(source.tileID)}`;
  if (source.kind === 'TAX') return getTileName(source.tileID);
  if (source.kind === 'CARD') {
    const deck = gameCardsById[source.cardId]?.sourceDeck;
    return deck === 'chance' ? 'Thẻ Cơ Hội' : deck === 'chest' ? 'Thẻ Khí Vận' : 'Thẻ sự kiện';
  }
  return source.description;
}

export default function DebtPanel() {
  const {
    state, playerId, canMutate, socketFunctions, connected, privatePlayerState, roomPlayers,
  } = useContext(stateContext);
  const roomExit = useRoomExit();
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
  const sellable = isMyShortfall ? claim?.sellableProperties : undefined;
  const deeds = useMemo(() => {
    const models = new Map<number, DeedCardModel>();
    for (const property of sellable ?? []) {
      const model = buildDeedCardModel({ tileId: property.tileID, state, roomPlayers });
      if (model) models.set(property.tileID, model);
    }
    return models;
  }, [roomPlayers, sellable, state]);

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
  const creditorPlayer = claim.creditor === 'BANK' ? undefined : state.players[claim.creditorPlayerId ?? ''];
  const creditor = claim.creditor === 'BANK'
    ? 'Ngân hàng'
    : creditorPlayer?.name ?? 'người chơi khác';
  const seconds = Math.max(0, Math.ceil((Date.parse(claim.actionDeadlineAt) - now) / 1000));
  const buyers = Object.entries(state.players).filter(([id]) => id !== playerId);
  const properties = claim.sellableProperties ?? [];
  const selectedProperty = properties.find(property => property.tileID === selectedTileId);
  const selectedBuyer = buyers.find(([buyerId]) => buyerId === selectedBuyerId);

  if (!isMyShortfall || !canMutate) {
    return (
      <section className="debt-panel debt-panel--status" role="status">
        <div className="debt-panel__status-copy">
          <strong>{`${debtor?.name ?? 'Người chơi'} đang thiếu ${formatMoney(claim.remainingAmount)}`}</strong>
          <span>{`Trả cho ${creditor}`}</span>
        </div>
        <Chip tone="loss" icon={<ActionIcon name="clock" />}>{`${seconds} giây còn lại`}</Chip>
      </section>
    );
  }

  if (forcedSaleActive) return null;

  return (
    <Modal
      open
      title="Cần thanh toán"
      eyebrow={describeDebtSource(claim.source)}
      role="alertdialog"
      size="lg"
      tone="danger"
      className="debt-panel-modal"
      footer={roomExit
        ? (
          <>
            <span className="debt-panel__footer-note">Không xoay được tiền? Bạn có thể bỏ cuộc.</span>
            <Button
              variant="ghost"
              className="debt-panel__forfeit"
              icon={<ActionIcon name="forfeit" />}
              busy={roomExit.leaving}
              onClick={() => roomExit.requestLeave()}
            >Bỏ cuộc</Button>
          </>
        )
        : undefined}
    >
      {/* Focus starts on the amount, not on the first sale: on a short screen that button may sit below the fold. */}
      <section className="debt-panel__summary" aria-label="Khoản cần thanh toán" tabIndex={-1} data-modal-autofocus>
        <div className="debt-panel__due">
          <span className="debt-panel__label">Cần trả</span>
          <strong className="debt-panel__due-amount">{formatMoney(claim.amount)}</strong>
        </div>
        <div className="debt-panel__creditor">
          {creditorPlayer
            ? <PlayerAvatar characterId={creditorPlayer.characterId ?? null} colorId={creditorPlayer.color} size={32} />
            : <span className="debt-panel__bank" aria-hidden="true"><ActionIcon name="sellToBank" /></span>}
          <span className="debt-panel__creditor-name">
            <span className="debt-panel__label">Trả cho</span>
            <strong>{creditor}</strong>
          </span>
        </div>
        <Chip tone="loss" icon={<ActionIcon name="clock" />} className="debt-panel__countdown">
          {`${seconds} giây còn lại`}
        </Chip>
        <dl className="debt-panel__facts">
          <div className="debt-panel__fact debt-panel__fact--short">
            <dt>Còn thiếu</dt>
            <dd>{formatMoney(claim.remainingAmount)}</dd>
          </div>
          <div className="debt-panel__fact">
            <dt>Tiền mặt hiện có</dt>
            <dd>{formatMoney(debtor?.accountBalance ?? 0)}</dd>
          </div>
        </dl>
      </section>
      {error ? <p className="debt-panel__error" role="alert">{error}</p> : null}
      {pendingAction
        ? (
          <p className="debt-panel__pending" role="status">
            {pendingAction.ackResolved ? 'Đã xác nhận. Đang cập nhật khoản nợ…' : 'Đang gửi yêu cầu…'}
          </p>
        )
        : null}
      {properties.length > 0
        ? <h3 className="debt-panel__heading">Bán tài sản để có tiền</h3>
        : <p className="debt-panel__empty">Bạn không còn tài sản nào để bán.</p>}
      <div className="debt-panel__properties">
        {properties.map(property => {
          const propertyName = getTileName(property.tileID);
          const deed = deeds.get(property.tileID);
          const choosingBuyer = selectedTileId === property.tileID;
          const buyerStatusId = `debt-buyer-status-${property.tileID}`;
          return (
            <article key={property.tileID} className="debt-panel__property">
              {deed ? <PropertyDeedCard model={deed} variant="compact" showOwner={false} className="debt-panel__deed" /> : <strong>{propertyName}</strong>}
              <div className="debt-panel__property-actions">
                <Button
                  variant="secondary"
                  icon={<ActionIcon name="sellToBank" />}
                  aria-label={`Bán ${propertyName} cho Ngân hàng`}
                  disabled={pendingAction !== null || forcedSaleActive}
                  busy={pendingAction?.key === `bank:${property.tileID}`}
                  onClick={() => submit(`bank:${property.tileID}`, () => socketFunctions.sellPropertyToBank?.({
                    paymentOperationId: claim.paymentOperationId ?? '',
                    claimId: claim.claimId ?? '',
                    tileID: property.tileID,
                  }))}
                >
                  <span className="debt-panel__sale-label">
                    <span>Bán cho Ngân hàng</span>
                    {' '}
                    <strong>{`+${formatMoney(property.grossPrice)}`}</strong>
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  icon={<ActionIcon name="propose" />}
                  aria-label={`Đề nghị người chơi mua ${propertyName}`}
                  aria-pressed={choosingBuyer}
                  disabled={pendingAction !== null || forcedSaleActive || buyers.length === 0}
                  onClick={() => {
                    setSelectedTileId(choosingBuyer ? null : property.tileID);
                    setSelectedBuyerId(null);
                  }}
                >Đề nghị người chơi mua</Button>
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
                          <span className="debt-panel__buyer-avatar" aria-hidden="true">
                            <PlayerAvatar characterId={buyer.characterId ?? null} colorId={buyer.color} size={32} />
                          </span>
                          <span className="debt-panel__buyer-name">{buyer.name}</span>
                          <small>{affordable ? formatMoney(buyer.accountBalance) : 'Không đủ tiền'}</small>
                        </label>
                      );
                    })}
                    <Button
                      aria-describedby={buyerStatusId}
                      icon={<ActionIcon name="send" />}
                      disabled={!selectedBuyer || !selectedProperty || selectedBuyer[1].accountBalance < selectedProperty.grossPrice || pendingAction !== null}
                      busy={pendingAction?.key === `forced:${property.tileID}:${selectedBuyerId ?? ''}`}
                      onClick={() => {
                        if (!selectedBuyerId) return;
                        submit(`forced:${property.tileID}:${selectedBuyerId}`, () => socketFunctions.proposeForcedSale?.({
                          paymentOperationId: claim.paymentOperationId ?? '',
                          claimId: claim.claimId ?? '',
                          tileID: property.tileID,
                          buyerPlayerId: selectedBuyerId,
                        }));
                      }}
                    >Gửi đề nghị bán</Button>
                    <p id={buyerStatusId} className="debt-panel__buyer-hint">
                      {buyers.every(([, buyer]) => buyer.accountBalance < property.grossPrice)
                        ? `Không ai đủ tiền để mua với giá ${formatMoney(property.grossPrice)}.`
                        : selectedBuyer ? `Giá cố định ${formatMoney(property.grossPrice)}.` : 'Chọn một người mua để gửi đề nghị.'}
                    </p>
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
