import { useContext, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import stateContext from '../../internal';
import { useModalMotion } from './useModalMotion';
import { formatMoney } from './format';

// Live auction modal: shows the tile, list price, leading bid and countdown.
// Eligible players get a bid form (and a "No bid" pass); everyone else watches.
export default function AuctionPanel() {
  const { state, socketFunctions, playerId } = useContext(stateContext);
  const { backdropMotion, modalMotion } = useModalMotion();
  const [bidInput, setBidInput] = useState(0);

  const { auction } = state.boardState;

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
              <p>{`Closes in: ${auction.timer}s`}</p>
              {auction.active.includes(playerId as string)
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
                        value={bidInput || ''}
                        onChange={e => setBidInput(parseInt(e.target.value, 10) || 0)}
                        placeholder="Your bid"
                      />
                      <button className="open-market__sell-toast__button--yes" type="submit">Bid</button>
                    </form>
                    {auction.highestBidder === playerId
                      ? <p>You have the leading bid.</p>
                      : auction.passed.includes(playerId as string)
                        ? <p>You declined — place a bid to rejoin.</p>
                        : (
                          <button
                            className="open-market__sell-toast__button--no"
                            type="button"
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
