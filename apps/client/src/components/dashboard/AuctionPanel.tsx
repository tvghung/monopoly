import { useContext, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import stateContext from '../../internal';
import { useModalMotion } from './useModalMotion';
import { formatMoney } from './format';

// Live auction modal: shows the tile, list price, leading bid and countdown.
// Eligible players get a bid form (and a "No bid" pass); everyone else watches.
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
            <motion.div className="modal__card modal__card--offers" {...modalMotion}>
              <h3 className="open-market__offer__title">
                {`Auction: ${auction.tileName}`}
              </h3>
              <p>{`List price: ${formatMoney(auction.price)}`}</p>
              <p>
                {auction.highestBidder
                  ? `Highest bid: ${formatMoney(auction.highestBid)} by ${auction.highestBidderName}`
                  : 'No bids yet'}
              </p>
              <p>{`Closes in: ${remainingSeconds}s`}</p>
              {canMutate && playerId && auction.active.includes(playerId)
                ? (
                  <>
                    <form
                      className="open-market__offer__buttons"
                      onSubmit={e => {
                        e.preventDefault();
                        socketFunctions.placeBid(bidInput);
                        setBidInput(0);
                      }}
                    >
                      <input
                        className="open-market__sell-toast__input"
                        type="number"
                        min={auction.highestBid + 1}
                        disabled={remainingSeconds <= 0}
                        value={bidInput || ''}
                        onChange={e => setBidInput(parseInt(e.target.value, 10) || 0)}
                        placeholder="Your bid"
                      />
                      <button
                        className="open-market__sell-toast__button--yes"
                        type="submit"
                        disabled={remainingSeconds <= 0 || bidInput <= auction.highestBid}
                      >
                        Bid
                      </button>
                    </form>
                    {auction.highestBidder === playerId
                      ? <p>You have the leading bid.</p>
                      : auction.passed.includes(playerId)
                        ? <p>You declined — place a bid to rejoin.</p>
                        : (
                          <button
                            className="open-market__sell-toast__button--no"
                            type="button"
                            disabled={remainingSeconds <= 0}
                            title="Decline to bid for now (a new bid re-opens the floor)"
                            onClick={() => socketFunctions.passBid()}
                          >
                            No bid
                          </button>
                        )}
                  </>
                )
                : <p>You&apos;re watching this auction.</p>}
            </motion.div>
          </motion.div>
        )
        : null}
    </AnimatePresence>
  );
}
