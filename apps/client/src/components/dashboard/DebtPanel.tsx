import { useContext, useEffect, useId, useMemo, useState } from 'react';
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
import OfferCard from './OfferCard';
import { useIncomingOffers, type ActiveOffer } from './useIncomingOffers';
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

/**
 * The only offer the server accepts from a debtor (V1.1): another player offers cash and wants properties of the debtor, nothing
 * else on either side. Older offers of other shapes cannot be answered with "Chấp nhận" while the debt is open.
 */
function isDebtBuyOffer(offer: ActiveOffer): boolean {
  return offer.offered.cash > 0
    && offer.offered.propertyIds.length === 0
    && offer.offered.jailFreeCardIds.length === 0
    && offer.requested.cash === 0
    && offer.requested.propertyIds.length > 0
    && offer.requested.jailFreeCardIds.length === 0;
}

/** The price a seller typed: a positive whole number of units, or null while the field is empty or not a number. */
function parseAskedPrice(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647 ? value : null;
}

export default function DebtPanel() {
  const {
    state, playerId, canMutate, socketFunctions, connected, privatePlayerState, roomPlayers,
  } = useContext(stateContext);
  const roomExit = useRoomExit();
  const { offers, acceptOffer, declineOffer } = useIncomingOffers();
  const descriptionId = useId();
  const priceId = useId();
  const [now, setNow] = useState(() => Date.now());
  const claim = state.boardState.paymentShortfall;
  const isMyShortfall = claim?.debtorPlayerId === playerId;
  const claimProjectionKey = claim ? getDebtProjectionKey(claim) : null;
  const forcedSaleProposal = privatePlayerState?.forcedSaleProposal ?? null;
  const forcedSaleActive = Boolean(forcedSaleProposal && forcedSaleProposal.sellerPlayerId === playerId);
  const [pendingAction, setPendingAction] = useState<PendingDebtAction | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const [selectedBuyerId, setSelectedBuyerId] = useState<string | null>(null);
  // What the seller asks for the selected property, as typed; it starts at the Bank price.
  const [priceText, setPriceText] = useState('');
  const [answeringOfferId, setAnsweringOfferId] = useState<string | null>(null);
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

  // An answer waits for the offer to disappear; if nothing arrives (a refused command), the buttons come back.
  useEffect(() => {
    if (!answeringOfferId) return undefined;
    const timer = window.setTimeout(() => setAnsweringOfferId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [answeringOfferId]);

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
  const debtOffers = isMyShortfall ? offers.filter(isDebtBuyOffer) : [];
  const askedPrice = parseAskedPrice(priceText);

  if (!isMyShortfall || !canMutate) {
    return (
      <section className="debt-panel debt-panel--status">
        {/* Only this copy is announced, and it changes with the claim. The countdown below ticks every second. */}
        <div className="debt-panel__status-copy" role="status">
          <strong>{`${debtor?.name ?? 'Người chơi'} đang thiếu ${formatMoney(claim.remainingAmount)}`}</strong>
          <span>{`Trả cho ${creditor}`}</span>
        </div>
        <span role="timer">
          <Chip tone="loss" icon={<ActionIcon name="clock" />}>{`${seconds} giây còn lại`}</Chip>
        </span>
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
      describedBy={descriptionId}
      footer={roomExit
        ? (
          <>
            <span className="debt-panel__footer-note">Không xoay được tiền? Bạn có thể bỏ cuộc.</span>
            {roomExit.error ? <p className="debt-panel__footer-error" role="alert">{roomExit.error}</p> : null}
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
      {/* What the dialog announces on open: the amount, the creditor and the shortfall. The countdown is left out. */}
      <p id={descriptionId} className="sr-only">
        {`Cần trả ${formatMoney(claim.amount)} cho ${creditor}. Còn thiếu ${formatMoney(claim.remainingAmount)}. Tiền mặt hiện có ${formatMoney(debtor?.accountBalance ?? 0)}.`}
      </p>
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
      {debtOffers.length > 0
        ? (
          <section className="debt-panel__offers" aria-label="Đề nghị mua tài sản của bạn">
            <h3 className="debt-panel__heading">Có người muốn mua tài sản của bạn</h3>
            {debtOffers.map(offer => {
              const shortAfter = claim.remainingAmount - ((debtor?.accountBalance ?? 0) + offer.offered.cash);
              return (
                <OfferCard
                  key={offer.offerId}
                  offer={offer}
                  title={`Đề nghị mua ${offer.requested.propertyIds.map(getTileName).join(', ')} của ${offer.proposerName}`}
                  busy={answeringOfferId === offer.offerId}
                  notes={(
                    <p className="debt-panel__offer-effect">
                      {shortAfter <= 0
                        ? `Bạn nhận ${formatMoney(offer.offered.cash)}, đủ để trả khoản nợ này.`
                        : `Bạn nhận ${formatMoney(offer.offered.cash)}, vẫn còn thiếu ${formatMoney(shortAfter)} cho khoản nợ này.`}
                    </p>
                  )}
                  onAccept={current => { setAnsweringOfferId(current.offerId); acceptOffer(current); }}
                  onDecline={current => { setAnsweringOfferId(current.offerId); declineOffer(current); }}
                />
              );
            })}
          </section>
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
          const saleId = `debt-sale-${property.tileID}`;
          return (
            <article key={property.tileID} className="debt-panel__property">
              {deed ? <PropertyDeedCard model={deed} variant="compact" showOwner={false} className="debt-panel__deed" /> : <strong>{propertyName}</strong>}
              <div className="debt-panel__property-actions">
                {/* The accessible name keeps the tile; this is what the sale brings, read after it. */}
                <span id={saleId} className="sr-only">{`Nhận ${formatMoney(property.grossPrice)}`}</span>
                <Button
                  variant="secondary"
                  icon={<ActionIcon name="sellToBank" />}
                  aria-label={`Bán ${propertyName} cho Ngân hàng`}
                  aria-describedby={saleId}
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
                    setPriceText(choosingBuyer ? '' : String(property.grossPrice));
                  }}
                >Đề nghị người chơi mua</Button>
              </div>
              {choosingBuyer
                ? (
                  <fieldset className="debt-panel__buyer-picker">
                    <legend>Chọn người mua</legend>
                    <div className="debt-panel__price">
                      <label htmlFor={priceId}>Giá bán (đơn vị nghìn đồng)</label>
                      <div className="debt-panel__price-field">
                        <input
                          id={priceId}
                          className="debt-panel__price-input"
                          type="number"
                          inputMode="numeric"
                          min="1"
                          step="1"
                          value={priceText}
                          disabled={pendingAction !== null}
                          aria-invalid={askedPrice === null}
                          onChange={event => setPriceText(event.target.value)}
                        />
                        {askedPrice !== null ? <output className="debt-panel__price-preview" htmlFor={priceId}>{formatMoney(askedPrice)}</output> : null}
                      </div>
                    </div>
                    {buyers.map(([buyerId, buyer]) => {
                      const affordable = buyer.accountBalance >= (askedPrice ?? property.grossPrice);
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
                      disabled={!selectedBuyer || !selectedProperty || askedPrice === null || selectedBuyer[1].accountBalance < askedPrice || pendingAction !== null}
                      busy={pendingAction?.key === `forced:${property.tileID}:${selectedBuyerId ?? ''}`}
                      onClick={() => {
                        if (!selectedBuyerId || askedPrice === null) return;
                        submit(`forced:${property.tileID}:${selectedBuyerId}`, () => socketFunctions.proposeForcedSale?.({
                          paymentOperationId: claim.paymentOperationId ?? '',
                          claimId: claim.claimId ?? '',
                          tileID: property.tileID,
                          buyerPlayerId: selectedBuyerId,
                          price: askedPrice,
                        }));
                      }}
                    >Gửi đề nghị bán</Button>
                    <p id={buyerStatusId} className="debt-panel__buyer-hint">
                      {askedPrice === null
                        ? 'Nhập một giá bán lớn hơn 0.'
                        : buyers.every(([, buyer]) => buyer.accountBalance < askedPrice)
                          ? `Không ai đủ tiền để mua với giá ${formatMoney(askedPrice)}.`
                          : selectedBuyer ? `Người mua sẽ trả ${formatMoney(askedPrice)}.` : 'Chọn một người mua để gửi đề nghị.'}
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
