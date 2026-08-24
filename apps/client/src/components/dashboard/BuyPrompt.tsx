import { useContext, useEffect, useRef, useState } from 'react';
import { tileState } from '@monopoly/shared';
import stateContext from '../../internal';
import { formatMoney, getTileName, localizeAckError } from '../../presentation';
import Modal from '../../design-system/components/Modal/Modal';
import Button from '../../design-system/components/Button/Button';
import { usePresentation } from '../../game/presentation/PresentationProvider';

export default function BuyPrompt({ tokenArrived }: { tokenArrived: boolean }) {
  const {
    state, socketFunctions, playerId, canMutate, connected,
  } = useContext(stateContext);
  const { state: presentationState } = usePresentation();
  const [pendingAction, setPendingAction] = useState<'BUY' | 'DECLINE' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const player = playerId ? state.players[playerId] : undefined;
  const pending = state.turnInfo.pendingLandingDecision;
  const tileId = pending?.kind === 'PURCHASE' ? pending.tileID : undefined;
  const tile = typeof tileId === 'number' ? tileState[tileId] : undefined;
  const show = canMutate
    && state.loaded
    && state.boardState.currentPlayer.id === playerId
    && pending?.kind === 'PURCHASE'
    && tokenArrived;
  const operationId = pending?.kind === 'PURCHASE' ? pending.operationId : null;

  useEffect(() => {
    requestGeneration.current += 1;
    setPendingAction(null);
    setError(null);
    return () => { requestGeneration.current += 1; };
  }, [canMutate, connected, operationId, playerId, presentationState.presentationResetEpoch, show, tokenArrived]);

  const submit = (action: 'BUY' | 'DECLINE') => {
    if (pending?.kind !== 'PURCHASE' || pendingAction || !operationId) return;
    const requestGenerationAtStart = requestGeneration.current + 1;
    requestGeneration.current = requestGenerationAtStart;
    setPendingAction(action);
    setError(null);
    const request = action === 'BUY'
      ? socketFunctions.buyProperty(operationId)
      : socketFunctions.doNotBuy?.(operationId);
    if (request === undefined && action === 'DECLINE' && !socketFunctions.doNotBuy) {
      setPendingAction(null);
      setError('Từ chối mua hiện không khả dụng.');
      return;
    }
    void Promise.resolve(request)
      .then(response => {
        if (requestGeneration.current !== requestGenerationAtStart || !response) return;
        if (!response.ok) {
          setPendingAction(null);
          setError(localizeAckError(response.error));
        }
      })
      .catch(() => {
        if (requestGeneration.current !== requestGenerationAtStart) return;
        setPendingAction(null);
        setError('Không thể gửi lựa chọn. Vui lòng thử lại.');
      });
  };

  return (
    <Modal
      open={show}
      title={tile && typeof tileId === 'number' && typeof tile.price === 'number'
        ? `Mua ${getTileName(tileId)} với giá ${formatMoney(tile.price)}?`
        : 'Mua tài sản này?'}
    >
      {error ? <p role="alert">{error}</p> : null}
      <div className="center__dashboard__button__purchase">
        <Button
          data-modal-autofocus
          className="button__purchase--yes"
          type="button"
          busy={pendingAction === 'BUY'}
          disabled={pendingAction !== null
            || (typeof tile?.price === 'number' && (player?.accountBalance ?? 0) < tile.price)}
          onClick={() => submit('BUY')}
        >Mua tài sản</Button>
        <Button
          variant="secondary"
          className="button__purchase--no"
          type="button"
          busy={pendingAction === 'DECLINE'}
          disabled={pendingAction !== null}
          onClick={() => submit('DECLINE')}
        >Không mua</Button>
      </div>
    </Modal>
  );
}
