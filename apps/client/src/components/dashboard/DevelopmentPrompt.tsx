import { useContext } from 'react';
import stateContext from '../../internal';
import { formatMoney, getTileName } from '../../presentation';

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
    <section className="development-prompt" role="dialog" aria-labelledby="development-title">
      <h3 id="development-title">Phát triển {tileName}</h3>
      {decision.kind === 'DEVELOP_HOUSES'
        ? (
          <>
            <p>Chọn số Nhà (tối đa {max}) — {formatMoney(unitCost)} mỗi Nhà.</p>
            <div>
              {Array.from({ length: max }, (_, index) => {
                const quantity = index + 1;
                return (
                  <button
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
                  </button>
                );
              })}
            </div>
          </>
        )
        : (
          <button
            type="button"
            disabled={(player?.accountBalance ?? 0) < total}
            onClick={() => socketFunctions.resolveDevelopment?.({
              operationId: decision.operationId,
              action: 'UPGRADE_HOTEL',
            })}
          >
            Nâng cấp Khách sạn ({formatMoney(unitCost)})
          </button>
        )}
      <button
        type="button"
        onClick={() => socketFunctions.resolveDevelopment?.({
          operationId: decision.operationId,
          action: 'SKIP',
        })}
      >Bỏ qua</button>
    </section>
  );
}
