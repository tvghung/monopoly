import {
  useContext, useEffect, useId, useMemo, useState, type ReactNode,
} from 'react';
import {
  gameCardsById,
} from '@monopoly/shared';
import type { GameCardId } from '@monopoly/shared';
import stateContext from '../../internal';
import tradePromptContext from '../../tradePromptContext';
import {
  formatMoney,
  getTileName,
} from '../../presentation';
import Modal from '../../design-system/components/Modal/Modal';
import Button from '../../design-system/components/Button/Button';
import PlayerAvatar from '../../design-system/components/PlayerAvatar/PlayerAvatar';
import { ActionIcon } from '../../design-system/icons/ActionIcon';
import { buildDeedCardModel, type DeedCardModel } from '../../game/ui/property/deedCardModel';
import PropertyDeedCard from '../../game/ui/property/PropertyDeedCard';
import TeamChip from '../../game/team/TeamChip';
import './TradeOffer.css';
import { useTranslation, type Language } from '../../i18n/I18n';
import { translate } from '../../i18n/I18n';

function cardLabel(cardId: GameCardId, language: Language = 'vi'): string {
  const deck = gameCardsById[cardId]?.sourceDeck;
  const source = deck === 'chance' ? translate('board.chance', language) : deck === 'chest' ? translate('board.communityChest', language) : null;
  return source
    ? translate('trade.jailFreeCardDeck', language, { deck: source })
    : translate('trade.jailCard', language);
}

function toggleNumber(values: number[], value: number, checked: boolean): number[] {
  return checked ? [...values, value] : values.filter(current => current !== value);
}

function toggleCard(values: GameCardId[], value: GameCardId, checked: boolean): GameCardId[] {
  return checked ? [...values, value] : values.filter(current => current !== value);
}

/** "2 tài sản + 1 thẻ Thoát Tù + 50.000 ₫", or "chưa có gì". */
export function describeTradeSide(propertyCount: number, cardCount: number, cash: number, language: Language = 'vi'): string {
  const t = (key: Parameters<typeof translate>[0], values?: Readonly<Record<string, string | number>>) => translate(key, language, values);
  const parts = [
    propertyCount > 0 ? t('trade.assetCount', { count: propertyCount }) : null,
    cardCount > 0 ? t('trade.cardCount', { count: cardCount }) : null,
    cash > 0 ? formatMoney(cash) : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' + ') : t('trade.bundleEmpty');
}

/** One selectable deed or card: a real checkbox (keyboard and screen reader operable) drawn as the chip. */
function AssetChoice({
  name, checked, onChange, children,
}: {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="trade-asset">
      <input
        type="checkbox"
        className="trade-asset__input"
        aria-label={name}
        checked={checked}
        onChange={event => onChange(event.target.checked)}
      />
      {children}
      <span className="trade-asset__check" aria-hidden="true"><ActionIcon name="confirm" /></span>
    </label>
  );
}

export default function TradeOfferModal() {
  const { language, t } = useTranslation();
  const {
    state, socketFunctions, playerId, privatePlayerState, roomPlayers,
  } = useContext(stateContext);
  const {
    tradeTarget, closeTrade,
  } = useContext(tradePromptContext);
  const formId = useId();
  const [offeredCash, setOfferedCash] = useState(0);
  const [requestedCash, setRequestedCash] = useState(0);
  const [offeredPropertyIds, setOfferedPropertyIds] = useState<number[]>([]);
  const [requestedPropertyIds, setRequestedPropertyIds] = useState<number[]>([]);
  const [offeredJailFreeCardIds, setOfferedJailFreeCardIds] = useState<GameCardId[]>([]);

  const recipientPlayerId = tradeTarget
    ? state.boardState.ownedProps[tradeTarget.tileID]?.id ?? null
    : null;
  const recipient = recipientPlayerId ? state.players[recipientPlayerId] : undefined;
  const me = typeof playerId === 'string' ? state.players[playerId] : undefined;
  const heldJailFreeCardIds = privatePlayerState?.playerId === playerId
    ? [...new Set(privatePlayerState.heldJailFreeCardIds)]
    : [];
  const propertyIds = Object.keys(state.boardState.ownedProps).map(Number);
  const offeredPropertyOptions = propertyIds.filter(
    tileId => state.boardState.ownedProps[tileId]?.id === playerId,
  );
  const requestedPropertyOptions = propertyIds.filter(
    tileId => state.boardState.ownedProps[tileId]?.id === recipientPlayerId,
  );
  const hasBundleValue = offeredCash > 0
    || requestedCash > 0
    || offeredPropertyIds.length > 0
    || requestedPropertyIds.length > 0
    || offeredJailFreeCardIds.length > 0;
  const canSend = Boolean(recipientPlayerId) && recipientPlayerId !== playerId && hasBundleValue;
  const blockedReason = !recipientPlayerId || recipientPlayerId === playerId
    ? t('trade.noRecipient')
    : hasBundleValue ? null : t('trade.chooseMore');
  const deeds = useMemo(() => {
    const models = new Map<number, DeedCardModel>();
    for (const [tileKey, property] of Object.entries(state.boardState.ownedProps)) {
      if (property.id !== playerId && property.id !== recipientPlayerId) continue;
      const model = buildDeedCardModel({ tileId: Number(tileKey), state, roomPlayers, language });
      if (model) models.set(Number(tileKey), model);
    }
    return models;
  }, [language, playerId, recipientPlayerId, roomPlayers, state]);

  useEffect(() => {
    if (!tradeTarget) return;
    const requestedTileId = tradeTarget.tileID;
    setOfferedCash(0);
    setRequestedCash(0);
    setOfferedPropertyIds([]);
    setOfferedJailFreeCardIds([]);
    setRequestedPropertyIds([requestedTileId]);
  }, [tradeTarget, recipientPlayerId]);

  useEffect(() => {
    const heldCards = new Set(
      privatePlayerState?.playerId === playerId
        ? privatePlayerState.heldJailFreeCardIds
        : [],
    );
    setOfferedJailFreeCardIds(current => current.filter(cardId => heldCards.has(cardId)));
  }, [privatePlayerState, playerId]);

  useEffect(() => {
    setOfferedPropertyIds(current => current.filter(tileId => (
      state.boardState.ownedProps[tileId]?.id === playerId
    )));
    setRequestedPropertyIds(current => current.filter(tileId => (
      state.boardState.ownedProps[tileId]?.id === recipientPlayerId
    )));
  }, [playerId, recipientPlayerId, state.boardState.ownedProps]);

  const renderDeed = (tileId: number) => {
    const model = deeds.get(tileId);
    return model
      ? <PropertyDeedCard model={model} variant="chip" />
      : <span className="trade-asset__fallback">{getTileName(tileId, language)}</span>;
  };

  return (
    <Modal
      open={Boolean(state.loaded && tradeTarget)}
      title={t('trade.with', { name: recipient?.name ?? t('trade.recipientFallback') })}
      eyebrow={t('trade.title')}
      size="xl"
      onClose={closeTrade}
      peek="view"
      className="trade-offer-modal"
      footer={state.loaded && tradeTarget
        ? (
          <>
            <div className="trade-offer-summary">
              <p id={`${formId}-summary`} className="trade-offer-summary__line">
                {t('trade.sideSummary', {
                  offered: describeTradeSide(offeredPropertyIds.length, offeredJailFreeCardIds.length, offeredCash, language),
                  requested: describeTradeSide(requestedPropertyIds.length, 0, requestedCash, language),
                })}
              </p>
              {blockedReason ? <p className="trade-offer-summary__reason">{blockedReason}</p> : null}
            </div>
            <Button
              type="submit"
              form={formId}
              size="lg"
              icon={<ActionIcon name="send" />}
              aria-describedby={`${formId}-summary`}
              disabled={!canSend}
            >{t('trade.offer')}</Button>
          </>
        )
        : undefined}
    >
      {state.loaded && tradeTarget
        ? (
          <>
            <p className="trade-modal__lead">
              {t('trade.targetContext', { name: getTileName(tradeTarget.tileID, language) })}
            </p>
            <form
              id={formId}
              onSubmit={event => {
                event.preventDefault();
                if (!recipientPlayerId || recipientPlayerId === playerId || !hasBundleValue) return;
                socketFunctions.makeOffer({
                  recipientPlayerId,
                  offered: {
                    cash: offeredCash,
                    propertyIds: offeredPropertyIds,
                    jailFreeCardIds: offeredJailFreeCardIds,
                  },
                  requested: {
                    cash: requestedCash,
                    propertyIds: requestedPropertyIds,
                    // Exact ids held by another player are private. Never infer
                    // them from the public count or guess their source deck.
                    jailFreeCardIds: [],
                  },
                });
                closeTrade();
              }}
              className="trade-offer-form"
            >
              <div className="trade-form__bundles">
                <fieldset className="trade-bundle trade-bundle--give">
                  <legend>{t('trade.send')}</legend>
                  <div className="trade-bundle__body">
                    <div className="trade-bundle__owner">
                      {me ? <PlayerAvatar characterId={me.characterId ?? null} colorId={me.color} size={32} /> : null}
                      <span>{me ? t('trade.you', { name: me.name }) : t('ui.you')}</span>
                    </div>
                    <label htmlFor="private-offer-cash">{t('trade.cashLabel')}</label>
                    <div className="trade-bundle__cash">
                      <input
                        id="private-offer-cash"
                        className="trade-offer-form__input"
                        value={offeredCash || ''}
                        onChange={event => setOfferedCash(parseInt(event.target.value, 10) || 0)}
                        type="number"
                        min="0"
                        step="1"
                        data-modal-autofocus
                      />
                      {offeredCash > 0 ? <output className="trade-bundle__preview" htmlFor="private-offer-cash">{formatMoney(offeredCash)}</output> : null}
                    </div>
                    <span className="trade-bundle__label">{t('trade.assets')}</span>
                    {offeredPropertyOptions.length > 0
                      ? (
                        <div className="trade-bundle__assets">
                          {offeredPropertyOptions.map(tileId => (
                            <AssetChoice
                              key={tileId}
                              name={getTileName(tileId, language)}
                              checked={offeredPropertyIds.includes(tileId)}
                              onChange={checked => setOfferedPropertyIds(current => toggleNumber(current, tileId, checked))}
                            >{renderDeed(tileId)}</AssetChoice>
                          ))}
                        </div>
                      )
                      : <span className="trade-bundle__empty">{t('trade.noAssets')}</span>}
                    <span className="trade-bundle__label">{t('trade.jailCard')}</span>
                    {privatePlayerState === null
                      ? <span className="trade-bundle__empty">{t('trade.privateCardsLoading')}</span>
                      : heldJailFreeCardIds.length > 0
                        ? (
                          <div className="trade-bundle__assets">
                            {heldJailFreeCardIds.map(cardId => (
                              <AssetChoice
                                key={cardId}
                                name={cardLabel(cardId, language)}
                                checked={offeredJailFreeCardIds.includes(cardId)}
                                onChange={checked => setOfferedJailFreeCardIds(current => toggleCard(current, cardId, checked))}
                              >
                                <span className="trade-asset__card">
                                  <span className="trade-asset__card-icon" aria-hidden="true"><ActionIcon name="jailCard" /></span>
                                  {cardLabel(cardId, language)}
                                </span>
                              </AssetChoice>
                            ))}
                          </div>
                        )
                        : <span className="trade-bundle__empty">{t('trade.noCards')}</span>}
                  </div>
                </fieldset>

                <fieldset className="trade-bundle trade-bundle--receive">
                  <legend>{t('trade.receive')}</legend>
                  <div className="trade-bundle__body">
                    <div className="trade-bundle__owner">
                      {recipient ? <PlayerAvatar characterId={recipient.characterId ?? null} colorId={recipient.color} size={32} /> : null}
                      <span>{recipient?.name ?? t('trade.recipientFallback')}</span>
                      {recipientPlayerId ? <TeamChip playerId={recipientPlayerId} /> : null}
                    </div>
                    <label htmlFor="private-request-cash">{t('trade.cashLabel')}</label>
                    <div className="trade-bundle__cash">
                      <input
                        id="private-request-cash"
                        className="trade-offer-form__input"
                        value={requestedCash || ''}
                        onChange={event => setRequestedCash(parseInt(event.target.value, 10) || 0)}
                        type="number"
                        min="0"
                        step="1"
                      />
                      {requestedCash > 0 ? <output className="trade-bundle__preview" htmlFor="private-request-cash">{formatMoney(requestedCash)}</output> : null}
                    </div>
                    <span className="trade-bundle__label">{t('trade.assets')}</span>
                    {requestedPropertyOptions.length > 0
                      ? (
                        <div className="trade-bundle__assets">
                          {requestedPropertyOptions.map(tileId => (
                            <AssetChoice
                              key={tileId}
                              name={getTileName(tileId, language)}
                              checked={requestedPropertyIds.includes(tileId)}
                              onChange={checked => setRequestedPropertyIds(current => toggleNumber(current, tileId, checked))}
                            >{renderDeed(tileId)}</AssetChoice>
                          ))}
                        </div>
                      )
                      : <span className="trade-bundle__empty">{t('trade.noRecipientAssets')}</span>}
                    <span className="trade-bundle__label">{t('trade.jailCard')}</span>
                    <span id="requested-card-privacy" className="trade-bundle__empty">
                      {recipient?.getOutOfJailCardCount
                        ? t('trade.requestedCardPrivateCount', { name: recipient.name, count: recipient.getOutOfJailCardCount })
                        : t('trade.noPublicCards')}
                    </span>
                  </div>
                </fieldset>
              </div>
            </form>
          </>
        )
        : null}
    </Modal>
  );
}
