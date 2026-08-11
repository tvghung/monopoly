import { useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import stateContext from '../../internal';
import { useModalMotion } from './useModalMotion';
import { useIncomingOffers } from './useIncomingOffers';

// Modal listing the pending buy offers on this player's properties, each with a
// live countdown and accept/decline actions. Offer state lives in the
// useIncomingOffers hook.
export default function IncomingOffers() {
  const { state } = useContext(stateContext);
  const { backdropMotion, modalMotion } = useModalMotion();
  const { offers, acceptOffer, declineOffer } = useIncomingOffers();

  return (
    <AnimatePresence>
      {state.loaded && offers.length !== 0
        ? (
          <motion.div key="offers-modal" className="modal__overlay" {...backdropMotion}>
            <motion.div className="modal__card modal__card--offers" {...modalMotion}>
              {offers.map(current => (
                <section key={current.offerId} className="open-market__offer">
                  <h3 className="open-market__offer__title">
                    {`Offer from: ${current.buyerName}`}
                  </h3>
                  <h3 className="open-market__offer__title">
                    {`To buy: ${current.tileName}`}
                  </h3>
                  <p>{`Expires in: ${current.remainingSeconds} seconds`}</p>
                  <p>{`The offer is for $${current.price}M.`}</p>
                  <div className="open-market__offer__buttons">
                    <button
                      className="open-market__sell-toast__button--yes"
                      onClick={() => acceptOffer(current)}
                      type="button"
                      disabled={current.remainingSeconds <= 0}
                    >
                      Accept
                    </button>
                    <button
                      className="open-market__sell-toast__button--no"
                      onClick={() => declineOffer(current)}
                      type="button"
                      disabled={current.remainingSeconds <= 0}
                    >
                      Decline
                    </button>
                  </div>
                </section>
              ))}
            </motion.div>
          </motion.div>
        )
        : null}
    </AnimatePresence>
  );
}
