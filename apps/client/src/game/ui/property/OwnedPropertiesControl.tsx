import { useContext, useState } from 'react';
import stateContext from '../../../internal';
import Button from '../../../design-system/components/Button/Button';
import Modal from '../../../design-system/components/Modal/Modal';
import { ActionIcon } from '../../../design-system/icons/ActionIcon';
import PortfolioView, { PortfolioBalance } from './PortfolioView';

interface OwnedPropertiesModalProps {
  playerId: string;
  open: boolean;
  onClose: () => void;
  onSelect: (tileId: number) => void;
}

/** "Tài sản của tôi": the viewer's own portfolio. "Xem" closes it and opens that property in the inspection dialog. */
export function OwnedPropertiesModal({
  playerId, open, onClose, onSelect,
}: OwnedPropertiesModalProps) {
  const { state } = useContext(stateContext);
  const player = state.players[playerId];
  if (!player) return null;

  return (
    <Modal
      open={open}
      title="Tài sản của tôi"
      size="lg"
      onClose={onClose}
      closeOnOutsideClick
    >
      <PortfolioView
        ownerId={playerId}
        lead={<PortfolioBalance amount={player.accountBalance} />}
        emptyText="Bạn chưa sở hữu tài sản nào."
        onInspect={tileId => {
          onClose();
          onSelect(tileId);
        }}
      />
    </Modal>
  );
}

export default function OwnedPropertiesControl({ onSelect }: { onSelect: (tileId: number) => void }) {
  const { state, playerId, role } = useContext(stateContext);
  const [open, setOpen] = useState(false);

  if (!state.loaded || role !== 'PLAYER' || !playerId || !state.players[playerId]) return null;
  const ownedCount = Object.values(state.boardState.ownedProps)
    .filter(property => property.id === playerId).length;

  return (
    <aside className="game-board__property-access" aria-label="Tài sản của tôi">
      <Button
        className="game-board__property-button"
        variant="secondary"
        size="md"
        aria-label={`Tài sản của tôi (${ownedCount})`}
        icon={<ActionIcon name="buildHotel" />}
        onClick={() => setOpen(true)}
      >
        <span className="dock-label dock-label--long" aria-hidden="true">Tài sản của tôi</span>
        <span className="dock-label dock-label--short" aria-hidden="true">Tài sản</span>
        <span aria-hidden="true">{`(${ownedCount})`}</span>
      </Button>
      <OwnedPropertiesModal
        playerId={playerId}
        open={open}
        onClose={() => setOpen(false)}
        onSelect={onSelect}
      />
    </aside>
  );
}
