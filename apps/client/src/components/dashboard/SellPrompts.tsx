import {
  useCallback, useContext, useEffect, useState,
} from 'react';
import {
  gameCardsById,
} from '@monopoly/shared';
import type { GameCardId } from '@monopoly/shared';
import stateContext from '../../internal';
import sellPromptContext from '../../sellPromptContext';
import {
  formatMoney,
  getMortgageTransferSurcharge,
  getTileName,
} from '../../presentation';
import Modal from '../../design-system/components/Modal/Modal';

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

export default function SellPrompts() {
  const {
    state, socketFunctions, playerId, privatePlayerState,
  } = useContext(stateContext);
  const {
    openSale, setOpenSale, privateSale, setPrivateSale,
  } = useContext(sellPromptContext);
  const [priceInput, setPriceInput] = useState(0);
  const [offeredCash, setOfferedCash] = useState(0);
  const [requestedCash, setRequestedCash] = useState(0);
  const [offeredPropertyIds, setOfferedPropertyIds] = useState<number[]>([]);
  const [requestedPropertyIds, setRequestedPropertyIds] = useState<number[]>([]);
  const [offeredJailFreeCardIds, setOfferedJailFreeCardIds] = useState<GameCardId[]>([]);

  const recipientPlayerId = privateSale
    ? state.boardState.ownedProps[privateSale.tileID]?.id ?? null
    : null;
  const recipient = recipientPlayerId ? state.players[recipientPlayerId] : undefined;
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

  const offeredMortgageSurcharge = offeredPropertyIds.reduce((sum, tileId) => (
    sum + (state.boardState.ownedProps[tileId]?.mortgaged
      ? getMortgageTransferSurcharge(tileId)
      : 0)
  ), 0);
  const requestedMortgageSurcharge = requestedPropertyIds.reduce((sum, tileId) => (
    sum + (state.boardState.ownedProps[tileId]?.mortgaged
      ? getMortgageTransferSurcharge(tileId)
      : 0)
  ), 0);
  const hasBundleValue = offeredCash > 0
    || requestedCash > 0
    || offeredPropertyIds.length > 0
    || requestedPropertyIds.length > 0
    || offeredJailFreeCardIds.length > 0;

  const removeSellPropPrompt = useCallback(() => {
    setOpenSale(false);
    setPrivateSale(false);
  }, [setOpenSale, setPrivateSale]);

  useEffect(() => {
    if (!privateSale) return;
    const requestedTileId = privateSale.tileID;
    setOfferedCash(0);
    setRequestedCash(0);
    setOfferedPropertyIds([]);
    setOfferedJailFreeCardIds([]);
    setRequestedPropertyIds([requestedTileId]);
  }, [privateSale, recipientPlayerId]);

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

  return (
    <>
      <Modal
        open={Boolean(state.loaded && openSale)}
        title={openSale ? `Đăng bán ${getTileName(openSale.tileID)}` : 'Đăng bán tài sản'}
        onClose={removeSellPropPrompt}
        className="open-market__sell-toast"
      >
        {state.loaded && openSale
          ? (
            <>
              {state.boardState.ownedProps[openSale.tileID]?.mortgaged
                  ? (
                    <p className="trade-mortgage-note">
                      Tài sản đang cầm cố. Người mua trả thêm
                      {' '}
                      {formatMoney(getMortgageTransferSurcharge(openSale.tileID))}
                      {' '}
                      lãi chuyển nhượng, bằng 10% giá trị cầm cố.
                    </p>
                  )
                  : null}
              <form
                  onSubmit={event => {
                    event.preventDefault();
                    socketFunctions.putOpenMarket({ ...openSale, price: priceInput });
                    setPriceInput(0);
                    removeSellPropPrompt();
                  }}
                  className="open-market__sell-toast__form"
                >
                  <label htmlFor="open-sale-price">
                    Giá theo đơn vị nghìn đồng (ví dụ: 200 = {formatMoney(200)})
                  </label>
                  <div className="open-market__sell-toast__input--container">
                    <input
                      id="open-sale-price"
                      className="open-market__sell-toast__input"
                      value={priceInput || ''}
                      onChange={event => setPriceInput(parseInt(event.target.value, 10) || 0)}
                      type="number"
                      min="20"
                      step="1"
                      required
                      data-modal-autofocus
                    />
                    <button className="open-market__sell-toast__button" type="submit" disabled={priceInput < 20}>Đăng lên thị trường</button>
                  </div>
                  {priceInput > 0 ? <output>Giá bán: {formatMoney(priceInput)}</output> : null}
              </form>
            </>
          )
          : null}
      </Modal>
      <Modal
        open={Boolean(state.loaded && privateSale)}
        title={`Giao dịch với ${recipient?.name ?? 'người sở hữu tài sản'}`}
        onClose={removeSellPropPrompt}
        className="open-market__sell-toast trade-modal"
      >
        {state.loaded && privateSale
          ? (
            <>
              <p className="trade-modal__lead">
                  Gói đề nghị ban đầu yêu cầu {getTileName(privateSale.tileID)}. Bạn có thể chọn thêm tiền và nhiều tài sản ở cả hai phía.
                </p>
              <form
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
                    removeSellPropPrompt();
                  }}
                  className="open-market__sell-toast__form trade-form"
                >
                  <div className="trade-form__bundles">
                    <fieldset className="trade-bundle">
                      <legend>Bạn giao</legend>
                      <label htmlFor="private-offer-cash">
                        Tiền (đơn vị nghìn đồng)
                      </label>
                      <input
                        id="private-offer-cash"
                        className="open-market__sell-toast__input"
                        value={offeredCash || ''}
                        onChange={event => setOfferedCash(parseInt(event.target.value, 10) || 0)}
                        type="number"
                        min="0"
                        step="1"
                        data-modal-autofocus
                      />
                      {offeredCash > 0 ? <output>{formatMoney(offeredCash)}</output> : null}
                      <span className="trade-bundle__label">Tài sản</span>
                      {offeredPropertyOptions.length > 0
                        ? offeredPropertyOptions.map(tileId => {
                          const property = state.boardState.ownedProps[tileId];
                          return (
                            <label className="trade-asset" key={tileId}>
                              <input
                                type="checkbox"
                                checked={offeredPropertyIds.includes(tileId)}
                                onChange={event => setOfferedPropertyIds(current => (
                                  toggleNumber(current, tileId, event.target.checked)
                                ))}
                              />
                              <span>
                                {getTileName(tileId)}
                                {property?.mortgaged
                                  ? ` — đang cầm cố; ${recipient?.name ?? 'người nhận'} trả thêm ${formatMoney(getMortgageTransferSurcharge(tileId))} (10% giá trị cầm cố)`
                                  : ''}
                              </span>
                            </label>
                          );
                        })
                        : <span className="trade-bundle__empty">Bạn chưa có tài sản để giao.</span>}
                      <span className="trade-bundle__label">Thẻ Thoát Tù Miễn Phí</span>
                      {privatePlayerState === null
                        ? <span className="trade-bundle__empty">Đang đồng bộ danh sách thẻ riêng của bạn…</span>
                        : heldJailFreeCardIds.length > 0
                          ? heldJailFreeCardIds.map(cardId => (
                            <label className="trade-asset" key={cardId}>
                              <input
                                type="checkbox"
                                checked={offeredJailFreeCardIds.includes(cardId)}
                                onChange={event => setOfferedJailFreeCardIds(current => (
                                  toggleCard(current, cardId, event.target.checked)
                                ))}
                              />
                              <span>{cardLabel(cardId)}</span>
                            </label>
                          ))
                          : <span className="trade-bundle__empty">Bạn không giữ thẻ nào.</span>}
                    </fieldset>

                    <fieldset className="trade-bundle">
                      <legend>Bạn nhận</legend>
                      <label htmlFor="private-request-cash">
                        Tiền (đơn vị nghìn đồng)
                      </label>
                      <input
                        id="private-request-cash"
                        className="open-market__sell-toast__input"
                        value={requestedCash || ''}
                        onChange={event => setRequestedCash(parseInt(event.target.value, 10) || 0)}
                        type="number"
                        min="0"
                        step="1"
                      />
                      {requestedCash > 0 ? <output>{formatMoney(requestedCash)}</output> : null}
                      <span className="trade-bundle__label">Tài sản</span>
                      {requestedPropertyOptions.length > 0
                        ? requestedPropertyOptions.map(tileId => {
                          const property = state.boardState.ownedProps[tileId];
                          return (
                            <label className="trade-asset" key={tileId}>
                              <input
                                type="checkbox"
                                checked={requestedPropertyIds.includes(tileId)}
                                onChange={event => setRequestedPropertyIds(current => (
                                  toggleNumber(current, tileId, event.target.checked)
                                ))}
                              />
                              <span>
                                {getTileName(tileId)}
                                {property?.mortgaged
                                  ? ` — đang cầm cố; bạn trả thêm ${formatMoney(getMortgageTransferSurcharge(tileId))} (10% giá trị cầm cố)`
                                  : ''}
                              </span>
                            </label>
                          );
                        })
                        : <span className="trade-bundle__empty">Người chơi này chưa có tài sản có thể giao.</span>}
                      <span className="trade-bundle__label">Thẻ Thoát Tù Miễn Phí</span>
                      <span id="requested-card-privacy" className="trade-bundle__empty">
                        {recipient?.getOutOfJailCardCount
                          ? `${recipient.name} đang giữ ${recipient.getOutOfJailCardCount} thẻ, nhưng danh tính thẻ là dữ liệu riêng. Bạn không thể yêu cầu một ID thẻ cụ thể; hãy nhờ họ chủ động gửi đề nghị có thẻ.`
                          : 'Không có thẻ công khai để yêu cầu. Danh tính thẻ của người khác luôn được giữ riêng.'}
                      </span>
                    </fieldset>
                  </div>

                  {offeredMortgageSurcharge > 0 || requestedMortgageSurcharge > 0
                    ? (
                      <p className="trade-mortgage-note">
                        Phí cầm cố nộp ngay cho Ngân hàng khi nhận tài sản:
                        {' '}
                        bạn trả {formatMoney(requestedMortgageSurcharge)};
                        {' '}
                        {recipient?.name ?? 'bên kia'} trả {formatMoney(offeredMortgageSurcharge)}.
                        Mỗi khoản bằng 10% giá trị cầm cố và không nằm trong số tiền đổi giữa hai bên.
                      </p>
                    )
                    : null}
                  <button
                    className="open-market__sell-toast__button"
                    type="submit"
                    disabled={!recipientPlayerId || recipientPlayerId === playerId || !hasBundleValue}
                  >
                    Gửi đề nghị
                  </button>
              </form>
            </>
          )
          : null}
      </Modal>
    </>
  );
}
