import { useContext, useMemo, type ReactNode } from 'react';
import Button from '../../../design-system/components/Button/Button';
import Modal from '../../../design-system/components/Modal/Modal';
import { ActionIcon } from '../../../design-system/icons/ActionIcon';
import stateContext from '../../../internal';
import tradePromptContext from '../../../tradePromptContext';
import { buildDeedCardModel } from './deedCardModel';
import PropertyDeedCard from './PropertyDeedCard';
import { useRetainedValue } from './useRetainedValue';
import './PropertyInspectionModal.css';

interface PropertyInspectionModalProps {
  tileId: number | null;
  onClose: () => void;
}

/**
 * Any tile of the board as a card: the deed (streets, railroads, utilities) or the rule card (start, jail, tax, chance ...).
 * The owner of a street can sell a house back to the bank; everyone else can propose to buy an owned property.
 */
export default function PropertyInspectionModal({ tileId, onClose }: PropertyInspectionModalProps) {
  const {
    state, playerId, socketFunctions, canMutate, roomPlayers,
  } = useContext(stateContext);
  const { openTradeForProperty } = useContext(tradePromptContext);
  // Keep showing the same tile while the dialog animates out.
  const shownTileId = useRetainedValue(tileId);
  const deed = useMemo(
    () => (shownTileId === null ? null : buildDeedCardModel({ tileId: shownTileId, state, roomPlayers })),
    [roomPlayers, shownTileId, state],
  );
  if (shownTileId === null || !deed) return null;

  const owned = state.boardState.ownedProps[shownTileId];
  const isStreet = deed.kind === 'street' && deed.houseCostText !== null;
  const canSellHouse = isStreet && deed.houses > 0;
  const canAct = Boolean(owned) && canMutate;
  const sellHint = canSellHouse ? 'Bán một Nhà về Ngân hàng' : 'Tài sản không có Nhà để bán';

  let footer: ReactNode = null;
  if (canAct && owned.id !== playerId) {
    footer = (
      <Button icon={<ActionIcon name="propose" />} onClick={() => openTradeForProperty(shownTileId)}>
        Đề nghị mua
      </Button>
    );
  } else if (canAct && isStreet) {
    footer = (
      <>
        <p
          className={`property-inspection__hint${canSellHouse ? '' : ' property-inspection__hint--reason'}`}
          role="note"
        >
          {`${sellHint}.`}
        </p>
        <Button
          variant="secondary"
          disabled={!canSellHouse}
          title={sellHint}
          icon={<ActionIcon name="sellHouse" />}
          onClick={() => socketFunctions.sellHouse(shownTileId)}
        >
          Bán Nhà
        </Button>
      </>
    );
  }

  return (
    <Modal
      open={tileId !== null}
      title={deed.name}
      eyebrow="Thông tin ô"
      headerAccent={deed.kind === 'special' ? undefined : deed.headerColor}
      onClose={onClose}
      closeOnOutsideClick
      footer={footer}
    >
      <div className="property-inspection">
        <PropertyDeedCard model={deed} variant="full" />
      </div>
    </Modal>
  );
}
