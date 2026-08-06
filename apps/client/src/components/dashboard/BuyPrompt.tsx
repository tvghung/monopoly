import { useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import stateContext from '../../internal';
import tileNames from '../BoardInitState';
import { useModalMotion } from './useModalMotion';

// Offered to the current player when they land on an unowned property: buy it at
// list price, or send it to auction. `tokenArrived` lets Dashboard hold the
// prompt until the player's token has finished walking to the landing tile.
export default function BuyPrompt({ tokenArrived }: { tokenArrived: boolean }) {
  const { state, socketFunctions, playerId } = useContext(stateContext);
  const { backdropMotion, modalMotion } = useModalMotion();
  const myPlayer = typeof playerId === 'string' ? state.players[playerId] : undefined;

  const show = state.loaded
    && state.boardState.currentPlayer.id === playerId
    && state.turnInfo.canBuyProp
    && tokenArrived;

  return (
    <AnimatePresence>
      {show
        ? (
          <motion.div key="buy-modal" className="modal__overlay" {...backdropMotion}>
            <motion.div className="modal__card" {...modalMotion}>
              {myPlayer && tileNames[myPlayer.currentTile]
                ? (
                  <h3 className="open-market__sell-toast__title">
                    {`Buy ${tileNames[myPlayer.currentTile].streetName} for $${tileNames[myPlayer.currentTile].price}M?`}
                  </h3>
                )
                : <h3 className="open-market__sell-toast__title">Buy this property?</h3>}
              <section className="center__dashboard__button__purchase">
                <button className="button__purchase--yes" type="button" onClick={() => socketFunctions.buyProperty()}>
                  Buy property
                </button>
                <button className="button__purchase--no" type="button" onClick={() => socketFunctions.declineProperty()}>
                  Auction it instead
                </button>
              </section>
            </motion.div>
          </motion.div>
        )
        : null}
    </AnimatePresence>
  );
}
