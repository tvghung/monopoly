import { useContext, useState } from 'react';
import stateContext from '../../../internal';
import Button from '../../../design-system/components/Button/Button';
import Modal from '../../../design-system/components/Modal/Modal';
import { ActionIcon } from '../../../design-system/icons/ActionIcon';
import PortfolioView, { PortfolioBalance } from './PortfolioView';
import { useTranslation } from '../../../i18n/I18n';

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
  const { t } = useTranslation();
  const { state } = useContext(stateContext);
  const player = state.players[playerId];
  if (!player) return null;

  return (
    <Modal
      open={open}
      title={t('portfolio.mine')}
      size="lg"
      onClose={onClose}
      peek="view"
      closeOnOutsideClick
    >
      <PortfolioView
        ownerId={playerId}
        lead={<PortfolioBalance amount={player.accountBalance} />}
        emptyText={t('portfolio.noneMine')}
        onInspect={tileId => {
          onClose();
          onSelect(tileId);
        }}
      />
    </Modal>
  );
}

export default function OwnedPropertiesControl({ onSelect }: { onSelect: (tileId: number) => void }) {
  const { t } = useTranslation();
  const { state, playerId, role } = useContext(stateContext);
  const [open, setOpen] = useState(false);

  if (!state.loaded || role !== 'PLAYER' || !playerId || !state.players[playerId]) return null;
  const ownedCount = Object.values(state.boardState.ownedProps)
    .filter(property => property.id === playerId).length;

  return (
    <aside className="game-board__property-access" aria-label={t('portfolio.mine')}>
      <Button
        className="game-board__property-button"
        variant="secondary"
        size="md"
        aria-label={`${t('portfolio.mine')} (${ownedCount})`}
        icon={<ActionIcon name="buildHotel" />}
        onClick={() => setOpen(true)}
      >
        <span className="dock-label" aria-hidden="true">{t('portfolio.mine')}</span>
        {/* The brackets are drawn by CSS, so the phone key can show the bare number beside the icon. */}
        <span className="dock-count" aria-hidden="true">{ownedCount}</span>
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
