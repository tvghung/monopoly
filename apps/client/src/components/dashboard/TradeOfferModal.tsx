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

function cardLabel(cardId: GameCardId): string {
  const deck = gameCardsById[cardId]?.sourceDeck;
  const source = deck === 'chance' ? 'Cơ Hội' : deck === 'chest' ? 'Khí Vận' : null;
  return `Thẻ Thoát Tù Miễn Phí${source ? ` (${source})` : ''}`;
}

function toggleNumber(values: number[], value: number, checked: boolean): number[] {
  return checked ? [...values, value] : values.filter(current => current !== value);
}

function toggleCard(values: GameCardId[], value: GameCardId, checked: boolean): GameCardId[] {
  return checked ? [...values, value] : values.filter(current => current !== value);
}

/** "2 tài sản + 1 thẻ Thoát Tù + 50.000 ₫", or "chưa có gì". */
export function describeTradeSide(propertyCount: number, cardCount: number, cash: number): string {
  const parts = [
    propertyCount > 0 ? `${propertyCount} tài sản` : null,
    cardCount > 0 ? `${cardCount} thẻ Thoát Tù` : null,
    cash > 0 ? formatMoney(cash) : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' + ') : 'chưa có gì';
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
    ? 'Không tìm thấy người nhận hợp lệ.'
    : hasBundleValue ? null : 'Chọn tiền, tài sản hoặc thẻ để gửi đề nghị.';
  const deeds = useMemo(() => {
    const models = new Map<number, DeedCardModel>();
    for (const [tileKey, property] of Object.entries(state.boardState.ownedProps)) {
      if (property.id !== playerId && property.id !== recipientPlayerId) continue;
      const model = buildDeedCardModel({ tileId: Number(tileKey), state, roomPlayers });
      if (model) models.set(Number(tileKey), model);
    }
    return models;
  }, [playerId, recipientPlayerId, roomPlayers, state]);

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
      : <span className="trade-asset__fallback">{getTileName(tileId)}</span>;
  };

  return (
    <Modal
      open={Boolean(state.loaded && tradeTarget)}
      title={`Giao dịch với ${recipient?.name ?? 'người sở hữu tài sản'}`}
      eyebrow="Đề nghị giao dịch"
      size="xl"
      onClose={closeTrade}
      className="trade-offer-modal"
      footer={state.loaded && tradeTarget
        ? (
          <>
            <div className="trade-offer-summary">
              <p id={`${formId}-summary`} className="trade-offer-summary__line">
                {`Bạn giao ${describeTradeSide(offeredPropertyIds.length, offeredJailFreeCardIds.length, offeredCash)} · Bạn nhận ${describeTradeSide(requestedPropertyIds.length, 0, requestedCash)}`}
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
            >Gửi đề nghị</Button>
          </>
        )
        : undefined}
    >
      {state.loaded && tradeTarget
        ? (
          <>
            <p className="trade-modal__lead">
              Gói đề nghị ban đầu yêu cầu {getTileName(tradeTarget.tileID)}. Bạn có thể chọn thêm tiền và nhiều tài sản ở cả hai phía.
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
                  <legend>Bạn giao</legend>
                  <div className="trade-bundle__body">
                    <div className="trade-bundle__owner">
                      {me ? <PlayerAvatar characterId={me.characterId ?? null} colorId={me.color} size={32} /> : null}
                      <span>{me ? `${me.name} (bạn)` : 'Bạn'}</span>
                    </div>
                    <label htmlFor="private-offer-cash">Tiền (đơn vị nghìn đồng)</label>
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
                    <span className="trade-bundle__label">Tài sản</span>
                    {offeredPropertyOptions.length > 0
                      ? (
                        <div className="trade-bundle__assets">
                          {offeredPropertyOptions.map(tileId => (
                            <AssetChoice
                              key={tileId}
                              name={getTileName(tileId)}
                              checked={offeredPropertyIds.includes(tileId)}
                              onChange={checked => setOfferedPropertyIds(current => toggleNumber(current, tileId, checked))}
                            >{renderDeed(tileId)}</AssetChoice>
                          ))}
                        </div>
                      )
                      : <span className="trade-bundle__empty">Bạn chưa có tài sản để giao.</span>}
                    <span className="trade-bundle__label">Thẻ Thoát Tù Miễn Phí</span>
                    {privatePlayerState === null
                      ? <span className="trade-bundle__empty">Đang đồng bộ danh sách thẻ riêng của bạn…</span>
                      : heldJailFreeCardIds.length > 0
                        ? (
                          <div className="trade-bundle__assets">
                            {heldJailFreeCardIds.map(cardId => (
                              <AssetChoice
                                key={cardId}
                                name={cardLabel(cardId)}
                                checked={offeredJailFreeCardIds.includes(cardId)}
                                onChange={checked => setOfferedJailFreeCardIds(current => toggleCard(current, cardId, checked))}
                              >
                                <span className="trade-asset__card">
                                  <span className="trade-asset__card-icon" aria-hidden="true"><ActionIcon name="jailCard" /></span>
                                  {cardLabel(cardId)}
                                </span>
                              </AssetChoice>
                            ))}
                          </div>
                        )
                        : <span className="trade-bundle__empty">Bạn không giữ thẻ nào.</span>}
                  </div>
                </fieldset>

                <fieldset className="trade-bundle trade-bundle--receive">
                  <legend>Bạn nhận</legend>
                  <div className="trade-bundle__body">
                    <div className="trade-bundle__owner">
                      {recipient ? <PlayerAvatar characterId={recipient.characterId ?? null} colorId={recipient.color} size={32} /> : null}
                      <span>{recipient?.name ?? 'Người sở hữu tài sản'}</span>
                      {recipientPlayerId ? <TeamChip playerId={recipientPlayerId} /> : null}
                    </div>
                    <label htmlFor="private-request-cash">Tiền (đơn vị nghìn đồng)</label>
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
                    <span className="trade-bundle__label">Tài sản</span>
                    {requestedPropertyOptions.length > 0
                      ? (
                        <div className="trade-bundle__assets">
                          {requestedPropertyOptions.map(tileId => (
                            <AssetChoice
                              key={tileId}
                              name={getTileName(tileId)}
                              checked={requestedPropertyIds.includes(tileId)}
                              onChange={checked => setRequestedPropertyIds(current => toggleNumber(current, tileId, checked))}
                            >{renderDeed(tileId)}</AssetChoice>
                          ))}
                        </div>
                      )
                      : <span className="trade-bundle__empty">Người chơi này chưa có tài sản có thể giao.</span>}
                    <span className="trade-bundle__label">Thẻ Thoát Tù Miễn Phí</span>
                    <span id="requested-card-privacy" className="trade-bundle__empty">
                      {recipient?.getOutOfJailCardCount
                        ? `${recipient.name} đang giữ ${recipient.getOutOfJailCardCount} thẻ, nhưng danh tính thẻ là dữ liệu riêng. Bạn không thể yêu cầu một ID thẻ cụ thể; hãy nhờ họ chủ động gửi đề nghị có thẻ.`
                        : 'Không có thẻ công khai để yêu cầu. Danh tính thẻ của người khác luôn được giữ riêng.'}
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
