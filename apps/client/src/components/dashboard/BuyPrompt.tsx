import { useContext } from 'react';
import { tileState } from '@monopoly/shared';
import stateContext from '../../internal';
import { formatMoney, getTileName } from '../../presentation';
import Modal from '../../design-system/components/Modal/Modal';
import Button from '../../design-system/components/Button/Button';

export default function BuyPrompt({ tokenArrived }: { tokenArrived: boolean }) {
  const { state, socketFunctions, playerId, canMutate } = useContext(stateContext);
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
    <Modal
      open={show}
      title={tile && typeof tileId === 'number' && typeof tile.price === 'number'
        ? `Mua ${getTileName(tileId)} với giá ${formatMoney(tile.price)}?`
        : 'Mua tài sản này?'}
    >
      <div className="center__dashboard__button__purchase">
        <Button
          data-modal-autofocus
          className="button__purchase--yes"
          type="button"
          disabled={typeof tile?.price === 'number' && (player?.accountBalance ?? 0) < tile.price}
          onClick={() => {
            if (pending?.kind === 'PURCHASE') socketFunctions.buyProperty(pending.operationId);
          }}
        >Mua tài sản</Button>
        <Button
          variant="secondary"
          className="button__purchase--no"
          type="button"
          onClick={() => {
            if (pending?.kind === 'PURCHASE') socketFunctions.doNotBuy?.(pending.operationId);
          }}
        >Không mua</Button>
      </div>
    </Modal>
  );
}
