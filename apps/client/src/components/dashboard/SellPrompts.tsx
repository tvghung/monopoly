import { useContext, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import stateContext from '../../internal';
import sellPromptContext from '../../sellPromptContext';
import tileNames from '../BoardInitState';
import { useModalMotion } from './useModalMotion';

// The two owner-initiated sale dialogs, driven by sellPromptContext: put a
// property on the open market at a set price, or make a private offer for one.
// Both are dismissible by clicking the backdrop or the ❌.
export default function SellPrompts() {
  const { state, socketFunctions } = useContext(stateContext);
  const {
    openSale, setOpenSale, privateSale, setPrivateSale,
  } = useContext(sellPromptContext);
  const { backdropMotion, modalMotion } = useModalMotion();
  const [priceInput, setPriceInput] = useState(0);
  const [offer, setOffer] = useState(0);

  const removeSellPropPrompt = () => {
    setOpenSale(false);
    setPrivateSale(false);
  };

  return (
    <>
      <AnimatePresence>
        {state.loaded && openSale
          ? (
            <motion.div
              key="open-sale-modal"
              className="modal__overlay"
              role="presentation"
              onClick={removeSellPropPrompt}
              {...backdropMotion}
            >
              <motion.article
                className="modal__card open-market__sell-toast"
                role="presentation"
                onClick={e => e.stopPropagation()}
                {...modalMotion}
              >
                <h3 role="presentation" className="open-market__sell-toast__close" onClick={removeSellPropPrompt}>❌</h3>
                <h3 className="open-market__sell-toast__title">
                  Sell
                  {' '}
                  {tileNames[openSale.tileID].streetName}
                  {' '}
                  for:
                </h3>
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    if (openSale) {
                      socketFunctions.putOpenMarket({ ...openSale, price: priceInput });
                    }
                    setPriceInput(0);
                    setOpenSale(false);
                  }}
                  className="open-market__sell-toast__form"
                >
                  <label htmlFor="open-sale-price"> Input in millions. (e.g. 200 = $200M)</label>
                  <div className="open-market__sell-toast__input--container">
                    <input
                      id="open-sale-price"
                      className="open-market__sell-toast__input"
                      onChange={e => setPriceInput(parseInt(e.target.value, 10))}
                      type="number"
                      min="20"
                      autoFocus
                    />
                    <button className="open-market__sell-toast__button" type="submit">Put on the open market</button>
                  </div>
                </form>
              </motion.article>
            </motion.div>
          )
          : null}
      </AnimatePresence>
      <AnimatePresence>
        {state.loaded && privateSale
          ? (
            <motion.div
              key="private-sale-modal"
              className="modal__overlay"
              role="presentation"
              onClick={removeSellPropPrompt}
              {...backdropMotion}
            >
              <motion.article
                className="modal__card open-market__sell-toast"
                role="presentation"
                onClick={e => e.stopPropagation()}
                {...modalMotion}
              >
                <h3 role="presentation" className="open-market__sell-toast__close" onClick={removeSellPropPrompt}>❌</h3>
                <h3 className="open-market__sell-toast__title">
                  Make offer for
                  {' '}
                  {tileNames[privateSale.tileID].streetName}
                  {' '}
                  for:
                </h3>
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    if (privateSale) socketFunctions.makeOffer({ ...privateSale, price: offer });
                    setOffer(0);
                    setPrivateSale(false);
                  }}
                  className="open-market__sell-toast__form"
                >
                  <label htmlFor="private-offer-price">Input in millions. e.g. 200 = $200M</label>
                  <div className="open-market__sell-toast__input--container">
                    <input
                      id="private-offer-price"
                      className="open-market__sell-toast__input"
                      onChange={e => setOffer(parseInt(e.target.value, 10))}
                      type="number"
                      min="20"
                      autoFocus
                    />
                    <button className="open-market__sell-toast__button" type="submit">Make offer</button>
                  </div>
                </form>
              </motion.article>
            </motion.div>
          )
          : null}
      </AnimatePresence>
    </>
  );
}
