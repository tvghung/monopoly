import { useContext, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import stateContext from '../../internal';
import { formatMoney, getTileName } from '../../presentation';
import { useModalMotion } from './useModalMotion';

// Live auction modal: the server remains authoritative for deadline and bids.
export default function AuctionPanel() {
  const {
    state, socketFunctions, playerId, canMutate,
  } = useContext(stateContext);
  const { backdropMotion, modalMotion } = useModalMotion();
  const [bidInput, setBidInput] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const { auction } = state.boardState;
  const auctionId = auction?.auctionId;
  useEffect(() => {
    if (!auctionId) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [auctionId]);

  const remainingSeconds = auction
    ? Math.max(0, Math.ceil((Date.parse(auction.endsAt) - now) / 1000))
    : 0;

  return (
    <AnimatePresence>
      {state.loaded && auction
        ? (
          <motion.div key="auction-modal" className="modal__overlay" {...backdropMotion}>
            <motion.div
              className="modal__card modal__card--offers"
              role="dialog"
              aria-modal="true"
              aria-labelledby="auction-title"
              tabIndex={-1}
              autoFocus
              {...modalMotion}
            >
              <h2 id="auction-title" className="open-market__offer__title">
                {auction.kind === 'PROPERTY'
                  ? `Đấu Giá: ${getTileName(auction.tileID)}`
                  : `Đấu Giá ${auction.buildingType === 'HOUSE' ? 'Nhà' : 'Khách Sạn'} cuối cùng`}
              </h2>
              <p>
                {auction.kind === 'PROPERTY'
                  ? `Giá niêm yết: ${formatMoney(auction.price)}`
                  : `Giá khởi điểm: ${formatMoney(auction.minimumBid)}`}
              </p>
              <p>
                {auction.highestBidder
                  ? `Giá cao nhất: ${formatMoney(auction.highestBid)} — ${auction.highestBidderName}`
                  : 'Chưa có lượt trả giá'}
              </p>
              <p>{`Kết thúc sau: ${remainingSeconds} giây`}</p>
              {canMutate && playerId && auction.active.includes(playerId)
                ? (
                  <>
                    <form
                      className="open-market__offer__buttons"
                      onSubmit={event => {
                        event.preventDefault();
                        socketFunctions.placeBid(bidInput);
                        setBidInput(0);
                      }}
                    >
                      <label className="sr-only" htmlFor="auction-bid">Giá bạn muốn trả</label>
                      <input
                        id="auction-bid"
                        className="open-market__sell-toast__input"
                        type="number"
                        min={auction.highestBid + 1}
                        disabled={remainingSeconds <= 0}
                        value={bidInput || ''}
                        onChange={event => setBidInput(parseInt(event.target.value, 10) || 0)}
                        placeholder="Nhập giá"
                      />
                      <button
                        className="open-market__sell-toast__button--yes"
                        type="submit"
                        disabled={remainingSeconds <= 0 || bidInput <= auction.highestBid}
                      >
                        Trả giá
                      </button>
                    </form>
                    {bidInput > 0 ? <output>Giá đã nhập: {formatMoney(bidInput)}</output> : null}
                    {auction.highestBidder === playerId
                      ? <p>Bạn đang trả giá cao nhất.</p>
                      : auction.passed.includes(playerId)
                        ? <p>Bạn đã bỏ qua — hãy trả giá để tham gia lại.</p>
                        : (
                          <button
                            className="open-market__sell-toast__button--no"
                            type="button"
                            disabled={remainingSeconds <= 0}
                            title="Tạm thời bỏ qua; bạn vẫn có thể trả giá khi có lượt mới"
                            onClick={() => socketFunctions.passBid()}
                          >
                            Bỏ qua
                          </button>
                        )}
                  </>
                )
                : <p>Bạn đang theo dõi phiên đấu giá này.</p>}
            </motion.div>
          </motion.div>
        )
        : null}
    </AnimatePresence>
  );
}
