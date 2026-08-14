import { useContext } from 'react';
import stateContext from '../../internal';
import Modal from '../../design-system/components/Modal/Modal';

// Game-over modal announcing the last player standing, tinted with their colour.
export default function WinnerBanner() {
  const { state } = useContext(stateContext);

  return (
    <Modal open={state.loaded && state.boardState.winner !== null} title="🏆 Ván chơi kết thúc!" role="alertdialog">
      {state.boardState.winner
        ? (
          <h3
            className="open-market__sell-toast__title"
            style={{ color: state.boardState.winner.color }}
          >
            {`${state.boardState.winner.name} chiến thắng!`}
          </h3>
        )
        : null}
    </Modal>
  );
}
