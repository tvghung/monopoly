import { useContext, useEffect, useId, useMemo, useState } from 'react';
import { gameCardsById } from '@monopoly/shared';
import type { Ack, PublicGameState } from '@monopoly/shared';
import stateContext from '../../internal';
import { formatMoney, getTileName } from '../../presentation';
import { useRoomExit } from '../../roomExitContext';
import Modal from '../../design-system/components/Modal/Modal';
import Button from '../../design-system/components/Button/Button';
import Chip from '../../design-system/components/Chip/Chip';
import PlayerAvatar from '../../design-system/components/PlayerAvatar/PlayerAvatar';
import { ActionIcon } from '../../design-system/icons/ActionIcon';
import { buildDeedCardModel, type DeedCardModel } from '../../game/ui/property/deedCardModel';
import PropertyDeedCard from '../../game/ui/property/PropertyDeedCard';
import OfferCard from './OfferCard';
import RescuePanel from './RescuePanel';
import useDebtPresentationHold from './useDebtPresentationHold';
import { useIncomingOffers, type ActiveOffer } from './useIncomingOffers';
import './DebtPanel.css';
import { useTranslation, type Language } from '../../i18n/I18n';
import { translate } from '../../i18n/I18n';
import { useLocalizedError } from '../../i18n/useLocalizedError';

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
function describeDebtSource(source: DebtClaimProjection['source'], language: Language): string {
  if (source.kind === 'RENT') return translate('debt.sourceRent', language, { name: getTileName(source.tileID, language) });
  if (source.kind === 'TAX') return getTileName(source.tileID, language);
  if (source.kind === 'CARD') {
    const deck = gameCardsById[source.cardId]?.sourceDeck;
    return deck === 'chance'
      ? translate('debt.sourceCard', language, { deck: translate('board.chance', language) })
      : deck === 'chest' ? translate('debt.sourceCard', language, { deck: translate('board.communityChest', language) }) : translate('debt.sourceOther', language);
  }
  return translate('debt.sourceOther', language);
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
  const { language, t } = useTranslation();
  const {
    state, playerId, canMutate, socketFunctions, connected, privatePlayerState, roomPlayers,
  } = useContext(stateContext);
  const roomExit = useRoomExit();
  const { offers, acceptOffer, declineOffer } = useIncomingOffers();
  const descriptionId = useId();
  const priceId = useId();
  const [now, setNow] = useState(() => Date.now());
  const claim = state.boardState.paymentShortfall;
  // The debt window waits for the hop, the coins and the figures that lead to it (V1.1 item 1).
  const heldForPresentation = useDebtPresentationHold(claim ?? null, state);
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
  const { error, clearError, setErrorKey, setAckError } = useLocalizedError();
  const sellable = isMyShortfall ? claim?.sellableProperties : undefined;
  const deeds = useMemo(() => {
    const models = new Map<number, DeedCardModel>();
    for (const property of sellable ?? []) {
      const model = buildDeedCardModel({ tileId: property.tileID, state, roomPlayers, language });
      if (model) models.set(property.tileID, model);
    }
    return models;
  }, [language, roomPlayers, sellable, state]);

  useEffect(() => {
    if (!claim) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [claim]);

  useEffect(() => {
    if (canMutate && connected && isMyShortfall) return;
    setPendingAction(null);
    clearError();
  }, [canMutate, clearError, connected, isMyShortfall]);

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
    clearError();
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
        setAckError(response.error);
      } catch {
        setPendingAction(null);
        setErrorKey('forcedSale.failed');
      }
    })();
  };

  if (!state.loaded || !claim || heldForPresentation) return null;
  // 2v2 Emergency Rescue: the debtor has nothing left to sell, so the open window is the teammate's decision, not a sale screen.
  if (claim.rescue) return <RescuePanel claim={claim} offer={claim.rescue} />;
  const debtor = state.players[claim.debtorPlayerId];
  const creditorPlayer = claim.creditor === 'BANK' ? undefined : state.players[claim.creditorPlayerId ?? ''];
  const creditor = claim.creditor === 'BANK'
    ? t('ui.bank')
    : creditorPlayer?.name ?? t('ui.player');
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
          <strong>{t('debt.summary', { name: debtor?.name ?? t('ui.player'), amount: formatMoney(claim.remainingAmount) })}</strong>
          <span>{t('debt.payTo', { name: creditor })}</span>
        </div>
        <span role="timer">
          <Chip tone="loss" icon={<ActionIcon name="clock" />}>{t('debt.secondsLeft', { seconds })}</Chip>
        </span>
      </section>
    );
  }

  if (forcedSaleActive) return null;

  return (
    <Modal
      open
      title={t('debt.title')}
      eyebrow={describeDebtSource(claim.source, language)}
      role="alertdialog"
      size="lg"
      tone="danger"
      className="debt-panel-modal"
      describedBy={descriptionId}
      footer={roomExit
        ? (
          <>
            <span className="debt-panel__footer-note">{t('debt.footerNote')}</span>
            {roomExit.error ? <p className="debt-panel__footer-error" role="alert">{roomExit.error}</p> : null}
            <Button
              variant="ghost"
              className="debt-panel__forfeit"
              icon={<ActionIcon name="forfeit" />}
              busy={roomExit.leaving}
              onClick={() => roomExit.requestLeave()}
            >{t('debt.forfeit')}</Button>
          </>
        )
        : undefined}
    >
      {/* What the dialog announces on open: the amount, the creditor and the shortfall. The countdown is left out. */}
      <p id={descriptionId} className="sr-only">
        {t('debt.context', { amount: formatMoney(claim.amount), creditor, remaining: formatMoney(claim.remainingAmount), cash: formatMoney(debtor?.accountBalance ?? 0) })}
      </p>
      {/* Focus starts on the amount, not on the first sale: on a short screen that button may sit below the fold. */}
      <section className="debt-panel__summary" aria-label={t('debt.summaryLabel')} tabIndex={-1} data-modal-autofocus>
        <div className="debt-panel__due">
          <span className="debt-panel__label">{t('debt.amountDue')}</span>
          <strong className="debt-panel__due-amount">{formatMoney(claim.amount)}</strong>
        </div>
        <div className="debt-panel__creditor">
          {creditorPlayer
            ? <PlayerAvatar characterId={creditorPlayer.characterId ?? null} colorId={creditorPlayer.color} size={32} />
            : <span className="debt-panel__bank" aria-hidden="true"><ActionIcon name="sellToBank" /></span>}
          <span className="debt-panel__creditor-name">
            <span className="debt-panel__label">{t('dashboard.payTo')}</span>
            <strong>{creditor}</strong>
          </span>
        </div>
        <Chip tone="loss" icon={<ActionIcon name="clock" />} className="debt-panel__countdown">
          {t('debt.secondsLeft', { seconds })}
        </Chip>
        <dl className="debt-panel__facts">
          <div className="debt-panel__fact debt-panel__fact--short">
            <dt>{t('debt.remaining')}</dt>
            <dd>{formatMoney(claim.remainingAmount)}</dd>
          </div>
          <div className="debt-panel__fact">
            <dt>{t('debt.cash')}</dt>
            <dd>{formatMoney(debtor?.accountBalance ?? 0)}</dd>
          </div>
        </dl>
      </section>
      {error ? <p className="debt-panel__error" role="alert">{error}</p> : null}
      {pendingAction
        ? (
          <p className="debt-panel__pending" role="status">
            {pendingAction.ackResolved ? t('debt.pendingResolved') : t('debt.pending')}
          </p>
        )
        : null}
      {debtOffers.length > 0
        ? (
          <section className="debt-panel__offers" aria-label={t('debt.offersLabel')}>
            <h3 className="debt-panel__heading">{t('debt.offerHeading')}</h3>
            {debtOffers.map(offer => {
              const shortAfter = claim.remainingAmount - ((debtor?.accountBalance ?? 0) + offer.offered.cash);
              return (
                <OfferCard
                  key={offer.offerId}
                  offer={offer}
                  title={t('debt.offerTitle', { properties: offer.requested.propertyIds.map(tileId => getTileName(tileId, language)).join(', '), name: offer.proposerName })}
                  busy={answeringOfferId === offer.offerId}
                  notes={(
                    <p className="debt-panel__offer-effect">
                      {shortAfter <= 0
                        ? t('debt.offerEnough', { amount: formatMoney(offer.offered.cash) })
                        : t('debt.offerShort', { amount: formatMoney(offer.offered.cash), remaining: formatMoney(shortAfter) })}
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
        ? <h3 className="debt-panel__heading">{t('debt.sellHeading')}</h3>
        : <p className="debt-panel__empty">{t('debt.noAssets')}</p>}
      <div className="debt-panel__properties">
        {properties.map(property => {
          const propertyName = getTileName(property.tileID, language);
          const deed = deeds.get(property.tileID);
          const choosingBuyer = selectedTileId === property.tileID;
          const buyerStatusId = `debt-buyer-status-${property.tileID}`;
          const saleId = `debt-sale-${property.tileID}`;
          return (
            <article key={property.tileID} className="debt-panel__property">
              {deed ? <PropertyDeedCard model={deed} variant="compact" showOwner={false} className="debt-panel__deed" /> : <strong>{propertyName}</strong>}
              <div className="debt-panel__property-actions">
                {/* The accessible name keeps the tile; this is what the sale brings, read after it. */}
                <span id={saleId} className="sr-only">{t('debt.receive', { amount: formatMoney(property.grossPrice) })}</span>
                <Button
                  variant="secondary"
                  icon={<ActionIcon name="sellToBank" />}
                  aria-label={t('debt.sellToBank', { name: propertyName })}
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
                    <span>{t('debt.sellBank')}</span>
                    {' '}
                    <strong>{`+${formatMoney(property.grossPrice)}`}</strong>
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  icon={<ActionIcon name="propose" />}
                  aria-label={t('debt.offerPlayer', { name: propertyName })}
                  aria-pressed={choosingBuyer}
                  disabled={pendingAction !== null || forcedSaleActive || buyers.length === 0}
                  onClick={() => {
                    setSelectedTileId(choosingBuyer ? null : property.tileID);
                    setSelectedBuyerId(null);
                    setPriceText(choosingBuyer ? '' : String(property.grossPrice));
                  }}
                >{t('debt.offerPlayerShort')}</Button>
              </div>
              {choosingBuyer
                ? (
                  <fieldset className="debt-panel__buyer-picker">
                    <legend>{t('debt.chooseBuyer')}</legend>
                    <div className="debt-panel__price">
                      <label htmlFor={priceId}>{t('debt.priceLabel')}</label>
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
                          <small>{affordable ? formatMoney(buyer.accountBalance) : t('debt.notEnough')}</small>
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
                    >{t('debt.sendSaleOffer')}</Button>
                    <p id={buyerStatusId} className="debt-panel__buyer-hint">
                      {askedPrice === null
                        ? t('debt.pricePositive')
                        : buyers.every(([, buyer]) => buyer.accountBalance < askedPrice)
                          ? t('debt.noBuyerCanAfford', { amount: formatMoney(askedPrice) })
                          : selectedBuyer ? t('debt.buyerWillPay', { amount: formatMoney(askedPrice) }) : t('debt.chooseBuyerHint')}
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
