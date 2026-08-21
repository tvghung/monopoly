import { useContext, useState } from 'react';
import stateContext from '../../../internal';
import Modal from '../../../design-system/components/Modal/Modal';
import { getTileName } from '../formatters';

export default function OwnedPropertiesControl({ onSelect }: { onSelect: (tileId: number) => void }) {
  const { state, playerId, role } = useContext(stateContext);
  const [open, setOpen] = useState(false);

  if (!state.loaded || role !== 'PLAYER' || !playerId) return null;
  const ownedTileIds = Object.entries(state.boardState.ownedProps)
    .filter(([, property]) => property.id === playerId)
    .map(([tileId]) => Number(tileId))
    .sort((left, right) => left - right);

  return (
    <aside className="game-board__property-access" aria-label="Tài sản của tôi">
      <button
        className="game-board__property-button"
        type="button"
        onClick={() => setOpen(true)}
      >
        {`Tài sản của tôi (${ownedTileIds.length})`}
      </button>
      <Modal
        open={open}
        title="Tài sản của tôi"
        onClose={() => setOpen(false)}
        closeOnOutsideClick
        className="owned-properties-modal"
      >
        {ownedTileIds.length > 0
          ? (
            <ul className="owned-properties-list">
              {ownedTileIds.map(tileId => (
                <li key={tileId}>
                  <button
                    type="button"
                    className="owned-properties-list__item"
                    onClick={() => {
                      setOpen(false);
                      onSelect(tileId);
                    }}
                  >
                    {getTileName(tileId)}
                  </button>
                </li>
              ))}
            </ul>
          )
          : <p>Bạn chưa sở hữu tài sản nào.</p>}
      </Modal>
    </aside>
  );
}
