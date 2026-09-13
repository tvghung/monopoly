import { useContext, useState, type CSSProperties } from 'react';
import { Building2, Eye } from 'lucide-react';
import { tileState } from '@monopoly/shared';
import stateContext from '../../../internal';
import Modal from '../../../design-system/components/Modal/Modal';
import { formatMoney, getTileName } from '../formatters';
import { getPropertyGroupVisualStyle } from '../propertyVisualColors';

export default function OwnedPropertiesControl({ onSelect }: { onSelect: (tileId: number) => void }) {
  const { state, playerId, role } = useContext(stateContext);
  const [open, setOpen] = useState(false);

  if (!state.loaded || role !== 'PLAYER' || !playerId || !state.players[playerId]) return null;
  const player = state.players[playerId];
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
        <Building2 className="action-icon" aria-hidden="true" />
        {`Tài sản của tôi (${ownedTileIds.length})`}
      </button>
      <Modal
        open={open}
        title="Tài sản của tôi"
        onClose={() => setOpen(false)}
        closeOnOutsideClick
        className="owned-properties-modal"
      >
        <div className="owned-properties-summary">
          <span>Số dư hiện tại</span>
          <strong>{formatMoney(player.accountBalance)}</strong>
          <span>{`${ownedTileIds.length} tài sản`}</span>
        </div>
        {ownedTileIds.length > 0
          ? (
            <ul className="owned-properties-list">
              {ownedTileIds.map(tileId => {
                const tile = tileState[tileId];
                const owned = state.boardState.ownedProps[tileId];
                const group = getPropertyGroupVisualStyle(tile?.color);
                const development = owned.houses === 5
                  ? '1 Khách sạn'
                  : owned.houses > 0 ? `${owned.houses} Nhà` : null;
                return (
                <li
                  key={tileId}
                  className="owned-properties-list__item"
                  style={{ '--property-group-color': group.color } as CSSProperties}
                >
                  <span className="owned-properties-list__swatch" aria-hidden="true" />
                  <span className="owned-properties-list__details">
                    <strong>{getTileName(tileId)}</strong>
                    <span>{development ? `${group.label} · ${development}` : group.label}</span>
                  </span>
                  <button
                    type="button"
                    className="owned-properties-list__inspect"
                    aria-label={`Xem ${getTileName(tileId)}`}
                    title={`Xem ${getTileName(tileId)}`}
                    onClick={() => {
                      setOpen(false);
                      onSelect(tileId);
                    }}
                  >
                    <Eye className="action-icon action-icon--only" aria-hidden="true" />
                  </button>
                </li>
                );
              })}
            </ul>
          )
          : <p className="owned-properties-empty">Bạn chưa sở hữu tài sản nào.</p>}
      </Modal>
    </aside>
  );
}
