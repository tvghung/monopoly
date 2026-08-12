import { useContext } from 'react';
import { tileState } from '@monopoly/shared';
import { motion, AnimatePresence } from 'framer-motion';
import stateContext from '../../internal';
import { formatMoney, getTileName } from '../../presentation';
import { useModalMotion } from './useModalMotion';

// Offered after landing on an unowned property; declining starts an auction.
export default function BuyPrompt({ tokenArrived }: { tokenArrived: boolean }) {
  const {
    state, socketFunctions, playerId, canMutate,
  } = useContext(stateContext);
  const { backdropMotion, modalMotion } = useModalMotion();
  const myPlayer = typeof playerId === 'string' ? state.players[playerId] : undefined;
  const tileId = myPlayer?.currentTile;
  const tile = typeof tileId === 'number' ? tileState[tileId] : undefined;

  const show = canMutate
    && state.loaded
    && state.boardState.currentPlayer.id === playerId
    && state.turnInfo.canBuyProp
    && tokenArrived;

  return (
    <AnimatePresence>
      {show
        ? (
          <motion.div key="buy-modal" className="modal__overlay" {...backdropMotion}>
            <motion.div
              className="modal__card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="buy-property-title"
              {...modalMotion}
            >
              <h2 id="buy-property-title" className="open-market__sell-toast__title">
                {tile && typeof tileId === 'number' && typeof tile.price === 'number'
                  ? `Mua ${getTileName(tileId)} với giá ${formatMoney(tile.price)}?`
                  : 'Mua tài sản này?'}
              </h2>
              <div className="center__dashboard__button__purchase">
                <button autoFocus className="button__purchase--yes" type="button" onClick={() => socketFunctions.buyProperty()}>
                  Mua tài sản
                </button>
                <button className="button__purchase--no" type="button" onClick={() => socketFunctions.declineProperty()}>
                  Đưa ra đấu giá
                </button>
              </div>
            </motion.div>
          </motion.div>
        )
        : null}
    </AnimatePresence>
  );
}
