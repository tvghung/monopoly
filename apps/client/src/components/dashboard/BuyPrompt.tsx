import { useContext } from 'react';
import { tileState } from '@monopoly/shared';
import { motion, AnimatePresence } from 'framer-motion';
import stateContext from '../../internal';
import { formatMoney, getTileName } from '../../presentation';
import { useModalMotion } from './useModalMotion';

export default function BuyPrompt({ tokenArrived }: { tokenArrived: boolean }) {
  const { state, socketFunctions, playerId, canMutate } = useContext(stateContext);
  const { backdropMotion, modalMotion } = useModalMotion();
  const player = playerId ? state.players[playerId] : undefined;
  const pending = state.turnInfo.pendingLandingDecision;
  const tileId = pending?.kind === 'PURCHASE' ? pending.tileID : undefined;
  const tile = typeof tileId === 'number' ? tileState[tileId] : undefined;
  const show = canMutate
    && state.loaded
    && state.boardState.currentPlayer.id === playerId
    && pending?.kind === 'PURCHASE'
    && tokenArrived;

  return (
    <AnimatePresence>
      {show
        ? (
          <motion.div key="buy-modal" className="modal__overlay" {...backdropMotion}>
            <motion.div className="modal__card" role="dialog" aria-modal="true" aria-labelledby="buy-property-title" {...modalMotion}>
              <h2 id="buy-property-title" className="open-market__sell-toast__title">
                {tile && typeof tileId === 'number' && typeof tile.price === 'number'
                  ? `Mua ${getTileName(tileId)} với giá ${formatMoney(tile.price)}?`
                  : 'Mua tài sản này?'}
              </h2>
              <div className="center__dashboard__button__purchase">
                <button
                  autoFocus
                  className="button__purchase--yes"
                  type="button"
                  disabled={typeof tile?.price === 'number' && (player?.accountBalance ?? 0) < tile.price}
                  onClick={() => {
                    if (pending?.kind === 'PURCHASE') socketFunctions.buyProperty(pending.operationId);
                  }}
                >Mua tài sản</button>
                <button
                  className="button__purchase--no"
                  type="button"
                  onClick={() => {
                    if (pending?.kind === 'PURCHASE') socketFunctions.doNotBuy?.(pending.operationId);
                  }}
                >Không mua</button>
              </div>
            </motion.div>
          </motion.div>
        )
        : null}
    </AnimatePresence>
  );
}
