import { useContext } from 'react';
import stateContext from '../../internal';
import { formatMoney, getTileName } from '../../presentation';
import Modal from '../../design-system/components/Modal/Modal';
import Button from '../../design-system/components/Button/Button';

export default function DevelopmentPrompt({ tokenArrived }: { tokenArrived: boolean }) {
  const { state, playerId, canMutate, socketFunctions } = useContext(stateContext);
  const decision = state.turnInfo.pendingLandingDecision;
  if (!canMutate || !state.loaded || !tokenArrived || decision?.kind === 'PURCHASE'
    || decision?.playerId !== playerId) return null;
  const player = playerId ? state.players[playerId] : undefined;
  const unitCost = decision.unitCost ?? 0;
  const max = decision.maxQuantity ?? 1;
  const total = unitCost * max;
  const tileName = getTileName(decision.tileID);
  return (
    <Modal open title={`Phát triển ${tileName}`} className="development-prompt-modal">
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
                    disabled={(player?.accountBalance ?? 0) < unitCost * quantity}
                    onClick={() => socketFunctions.resolveDevelopment?.({
                      operationId: decision.operationId,
                      action: 'BUILD_HOUSES',
                      quantity,
                    })}
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
            disabled={(player?.accountBalance ?? 0) < total}
            onClick={() => socketFunctions.resolveDevelopment?.({
              operationId: decision.operationId,
              action: 'UPGRADE_HOTEL',
            })}
          >
            Nâng cấp Khách sạn ({formatMoney(unitCost)})
          </Button>
        )}
      <Button
        variant="secondary"
        type="button"
        onClick={() => socketFunctions.resolveDevelopment?.({
          operationId: decision.operationId,
          action: 'SKIP',
        })}
      >Bỏ qua</Button>
    </Modal>
  );
}
