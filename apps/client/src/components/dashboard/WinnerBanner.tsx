import { useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import stateContext from '../../internal';
import { useModalMotion } from './useModalMotion';

// Game-over modal announcing the last player standing, tinted with their colour.
export default function WinnerBanner() {
  const { state } = useContext(stateContext);
  const { backdropMotion, modalMotion } = useModalMotion();

  return (
    <AnimatePresence>
      {state.loaded && state.boardState.winner
        ? (
          <motion.div key="winner-modal" className="modal__overlay" {...backdropMotion}>
            <motion.div className="modal__card" {...modalMotion}>
              <h2 className="open-market__sell-toast__title">🏆 Game over!</h2>
              <h3
                className="open-market__sell-toast__title"
                style={{ color: state.boardState.winner.color }}
              >
                {`${state.boardState.winner.name} wins!`}
              </h3>
            </motion.div>
          </motion.div>
        )
        : null}
    </AnimatePresence>
  );
}
