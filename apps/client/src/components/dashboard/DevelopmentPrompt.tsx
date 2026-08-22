import { useContext, useEffect, useRef, useState } from 'react';
import stateContext from '../../internal';
import { formatMoney, getTileName, localizeAckError } from '../../presentation';
import Modal from '../../design-system/components/Modal/Modal';
import Button from '../../design-system/components/Button/Button';
import { usePresentation } from '../../game/presentation/PresentationProvider';

export default function DevelopmentPrompt({ tokenArrived }: { tokenArrived: boolean }) {
  const {
    state, playerId, canMutate, socketFunctions, connected,
  } = useContext(stateContext);
  const { state: presentationState } = usePresentation();
  const decision = state.turnInfo.pendingLandingDecision;
  const show = canMutate && state.loaded && tokenArrived && decision?.kind !== 'PURCHASE'
    && decision?.playerId === playerId;
  const operationId = show && decision ? decision.operationId : null;
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);

  useEffect(() => {
    requestGeneration.current += 1;
    setPendingAction(null);
    setError(null);
    return () => { requestGeneration.current += 1; };
  }, [canMutate, connected, operationId, playerId, presentationState.presentationResetEpoch, show, tokenArrived]);

  if (!show || !decision) return null;
  const player = playerId ? state.players[playerId] : undefined;
  const unitCost = decision.unitCost ?? 0;
  const max = decision.maxQuantity ?? 1;
  const total = unitCost * max;
  const tileName = getTileName(decision.tileID);
  const submit = (action: 'BUILD_HOUSES' | 'UPGRADE_HOTEL' | 'SKIP', quantity?: number) => {
    if (!operationId || pendingAction || (action === 'BUILD_HOUSES' && quantity === undefined)) return;
    const requestGenerationAtStart = requestGeneration.current + 1;
    requestGeneration.current = requestGenerationAtStart;
    setPendingAction(quantity ? `${action}:${quantity}` : action);
    setError(null);
    const request = action === 'BUILD_HOUSES'
      ? socketFunctions.resolveDevelopment?.({ operationId, action, quantity: quantity as number })
      : socketFunctions.resolveDevelopment?.({ operationId, action });
    if (request === undefined && !socketFunctions.resolveDevelopment) {
      setPendingAction(null);
      setError('Lựa chọn phát triển hiện không khả dụng.');
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
    <Modal open title={`Phát triển ${tileName}`} className="development-prompt-modal">
      {error ? <p role="alert">{error}</p> : null}
      {decision.kind === 'DEVELOP_HOUSES'
        ? (
          <>
            <p>Chọn số Nhà (tối đa {max}) — {formatMoney(unitCost)} mỗi Nhà.</p>
            <div>
              {Array.from({ length: max }, (_, index) => {
                const quantity = index + 1;
                return (
                  <Button
                    variant="secondary"
                    key={quantity}
                    type="button"
                    busy={pendingAction === `BUILD_HOUSES:${quantity}`}
                    disabled={pendingAction !== null || (player?.accountBalance ?? 0) < unitCost * quantity}
                    onClick={() => submit('BUILD_HOUSES', quantity)}
                  >
                    Xây {quantity} Nhà ({formatMoney(unitCost * quantity)})
                  </Button>
                );
              })}
            </div>
          </>
        )
        : (
          <Button
            type="button"
            busy={pendingAction === 'UPGRADE_HOTEL'}
            disabled={pendingAction !== null || (player?.accountBalance ?? 0) < total}
            onClick={() => submit('UPGRADE_HOTEL')}
          >
            Nâng cấp Khách sạn ({formatMoney(unitCost)})
          </Button>
        )}
      <Button
        variant="secondary"
        type="button"
        busy={pendingAction === 'SKIP'}
        disabled={pendingAction !== null}
        onClick={() => submit('SKIP')}
      >Bỏ qua</Button>
    </Modal>
  );
}
