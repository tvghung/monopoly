import { useContext } from 'react';
import stateContext from '../../internal';
import Modal from '../../design-system/components/Modal/Modal';
import { getPlayerDisplayColor } from '../../game/ui/playerVisualColors';

// Game-over modal announcing the last player standing, tinted with their colour.
export default function WinnerBanner() {
  const { state } = useContext(stateContext);

  return (
    <Modal open={state.loaded && state.boardState.winner !== null} title="🏆 Ván chơi kết thúc!" role="alertdialog">
      {state.boardState.winner
        ? (
          <h3
            className="trade-offer-modal__title"
            style={{ color: getPlayerDisplayColor(state.boardState.winner.color) }}
          >
            {`${state.boardState.winner.name} chiến thắng!`}
          </h3>
        )
        : null}
    </Modal>
  );
}
