import { useContext } from 'react';
import { tileState } from '@monopoly/shared';
import { CircleMinus, Handshake } from 'lucide-react';
import Modal from '../../../design-system/components/Modal/Modal';
import stateContext from '../../../internal';
import tradePromptContext from '../../../tradePromptContext';
import { formatMoney, getTileName } from '../formatters';
import PropertyCard from './PropertyCard';
import { getTileDetails } from './propertyDetails';
import './PropertyInspectionModal.css';

interface PropertyInspectionModalProps {
  tileId: number | null;
  onClose: () => void;
}

export default function PropertyInspectionModal({ tileId, onClose }: PropertyInspectionModalProps) {
  const { state, playerId, socketFunctions, canMutate } = useContext(stateContext);
  const { openTradeForProperty } = useContext(tradePromptContext);
  const tile = tileId === null ? undefined : tileState[tileId];
  const owned = tileId === null ? undefined : state.boardState.ownedProps[tileId];
  if (!tile || tileId === null) return null;

  const name = getTileName(tileId);
  const details = getTileDetails(tile);
  const houses = owned?.houses ?? 0;
  const isStreet = tile.tileType === 'normal' && typeof tile.houseCost === 'number';
  const canSellHouse = isStreet && houses > 0;

  return (
    <Modal open title={name} onClose={onClose} closeOnOutsideClick>
      <PropertyCard tileId={tileId} ownedProp={owned} className="property-inspection-card">
        {typeof tile.price === 'number'
          ? <p className="property-inspection__price">Giá mua: {formatMoney(tile.price)}</p>
          : null}
        <div className="property-inspection__details">
          {details.map(detail => (
            <p className="property-inspection__detail" key={`${detail.label}-${detail.value ?? ''}`}>
              <span>{detail.label}</span>
              {detail.value ? <strong>{detail.value}</strong> : null}
            </p>
          ))}
        </div>
        {owned && houses > 0
          ? (
            <p className="property-inspection__buildings">
              {houses === 5 ? '🏨 1 Khách Sạn' : `🏠 ${houses} Nhà`}
            </p>
          )
          : null}
        {owned && canMutate
          ? owned.id !== playerId
            ? (
              <button
                type="button"
                className="property-inspection__action"
                onClick={() => openTradeForProperty(tileId)}
              >
                <Handshake className="action-icon" aria-hidden="true" />Đề nghị mua
              </button>
            )
            : isStreet
              ? (
                <button
                  type="button"
                  disabled={!canSellHouse}
                  className="property-inspection__action"
                  title={canSellHouse ? 'Bán một Nhà về Ngân hàng' : 'Tài sản không có Nhà để bán'}
                  onClick={() => socketFunctions.sellHouse(tileId)}
                >
                  <CircleMinus className="action-icon" aria-hidden="true" />Bán Nhà
                </button>
              )
              : null
          : null}
      </PropertyCard>
    </Modal>
  );
}
