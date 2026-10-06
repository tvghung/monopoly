import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, HousePlus, SkipForward } from 'lucide-react';
import stateContext from '../../internal';
import { formatMoney, getTileName, localizeAckError } from '../../presentation';
import Modal from '../../design-system/components/Modal/Modal';
import Button from '../../design-system/components/Button/Button';
import { SHORT_VIEWPORT_QUERY, useMediaQuery } from '../../design-system/useMediaQuery';
import { usePresentation } from '../../game/presentation/PresentationProvider';
import { buildDeedCardModel } from '../../game/ui/property/deedCardModel';
import PropertyDeedCard from '../../game/ui/property/PropertyDeedCard';
import './DecisionSheet.css';

export default function DevelopmentPrompt({ tokenArrived }: { tokenArrived: boolean }) {
  const {
    state, playerId, canMutate, socketFunctions, connected, roomPlayers,
  } = useContext(stateContext);
  const { state: presentationState } = usePresentation();
  const short = useMediaQuery(SHORT_VIEWPORT_QUERY);
  const decision = state.turnInfo.pendingLandingDecision;
  const show = canMutate && state.loaded && tokenArrived && decision?.kind !== 'PURCHASE'
    && decision?.playerId === playerId;
  const operationId = show && decision ? decision.operationId : null;
  const tileId = show && decision ? decision.tileID : null;
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const deed = useMemo(
    () => (tileId !== null ? buildDeedCardModel({ tileId, state, roomPlayers, viewerPlayerId: playerId }) : null),
    [playerId, roomPlayers, state, tileId],
  );

  useEffect(() => {
    requestGeneration.current += 1;
    setPendingAction(null);
    setError(null);
    return () => { requestGeneration.current += 1; };
  }, [canMutate, connected, operationId, playerId, presentationState.presentationResetEpoch, show, tokenArrived]);

  if (!show || !decision) return null;
  const player = playerId ? state.players[playerId] : undefined;
  const balance = player?.accountBalance ?? 0;
  const unitCost = decision.unitCost ?? 0;
  const max = decision.maxQuantity ?? 1;
  const total = unitCost * max;
  const tileName = getTileName(decision.tileID);
  const affordableHouses = unitCost > 0 ? Math.min(max, Math.floor(balance / unitCost)) : max;
  const isHouses = decision.kind === 'DEVELOP_HOUSES';
  // 2v2 Team Investment: the lander pays from their own cash for a street a teammate owns; the owner never changes.
  const investmentOwner = deed?.owner && deed.owner.playerId !== playerId ? deed.owner : null;
  // Why an option is disabled, in words: the shortfall for the cheapest step, or how many the balance covers.
  const reason = isHouses
    ? affordableHouses === 0
      ? `Bạn còn thiếu ${formatMoney(unitCost - balance)} để xây 1 Nhà.`
      : affordableHouses < max ? `Số dư chỉ đủ xây tối đa ${affordableHouses} Nhà.` : null
    : balance < total ? `Bạn còn thiếu ${formatMoney(total - balance)} để nâng cấp Khách sạn.` : null;
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
    <Modal
      open
      title={`${investmentOwner ? 'Đầu tư' : 'Phát triển'} ${tileName}`}
      eyebrow={investmentOwner ? 'Đầu tư cho đồng đội' : isHouses ? 'Xây Nhà' : 'Nâng cấp'}
      size="lg"
      placement="sheet"
      backdrop="clear"
      className="decision-sheet development-prompt-modal"
    >
      <div className={`decision-sheet__layout${short ? ' decision-sheet__layout--compact' : ''}`}>
        {deed ? (
          <PropertyDeedCard
            model={deed}
            variant={short ? 'compact' : 'full'}
            showOwner={investmentOwner !== null}
            showNext
            className="decision-sheet__deed"
          />
        ) : null}
        <div className="decision-sheet__decision">
          <p className="decision-sheet__price">
            <span>{isHouses ? 'Chi phí mỗi Nhà' : 'Chi phí nâng cấp'}</span>
            <strong>{formatMoney(unitCost)}</strong>
          </p>
          <dl className="decision-sheet__math">
            <div><dt>Số dư hiện tại</dt><dd>{formatMoney(balance)}</dd></div>
          </dl>
          {investmentOwner
            ? (
              <p className="decision-sheet__note decision-sheet__note--team">
                {`Bạn trả bằng tiền của mình. ${tileName} vẫn thuộc về ${investmentOwner.name}, và ${investmentOwner.name} nhận lại tiền nếu sau này bán công trình.`}
              </p>
            )
            : null}
          {isHouses ? <p className="decision-sheet__note">Chọn số Nhà (tối đa {max}) — {formatMoney(unitCost)} mỗi Nhà.</p> : null}
          {reason ? <p className="decision-sheet__reason" role="note">{reason}</p> : null}
          {error ? <p className="decision-sheet__error" role="alert">{error}</p> : null}
          <div className="decision-sheet__actions development-prompt__options">
            {isHouses
              ? Array.from({ length: max }, (_, index) => {
                const quantity = index + 1;
                return (
                  <Button
                    variant="secondary"
                    size="lg"
                    icon={<HousePlus />}
                    key={quantity}
                    type="button"
                    busy={pendingAction === `BUILD_HOUSES:${quantity}`}
                    disabled={pendingAction !== null || balance < unitCost * quantity}
                    onClick={() => submit('BUILD_HOUSES', quantity)}
                  >
                    Xây {quantity} Nhà ({formatMoney(unitCost * quantity)})
                  </Button>
                );
              })
              : (
                <Button
                  size="lg"
                  type="button"
                  icon={<Building2 />}
                  busy={pendingAction === 'UPGRADE_HOTEL'}
                  disabled={pendingAction !== null || balance < total}
                  onClick={() => submit('UPGRADE_HOTEL')}
                >
                  Nâng cấp Khách sạn ({formatMoney(unitCost)})
                </Button>
              )}
            <Button
              className="development-prompt__skip"
              variant="ghost"
              size="lg"
              icon={<SkipForward />}
              type="button"
              busy={pendingAction === 'SKIP'}
              disabled={pendingAction !== null}
              onClick={() => submit('SKIP')}
            >Bỏ qua</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
