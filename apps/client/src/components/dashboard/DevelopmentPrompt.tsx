import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, HousePlus, SkipForward } from 'lucide-react';
import stateContext from '../../internal';
import { formatMoney, getTileName } from '../../presentation';
import Modal from '../../design-system/components/Modal/Modal';
import Button from '../../design-system/components/Button/Button';
import { SHORT_VIEWPORT_QUERY, useMediaQuery } from '../../design-system/useMediaQuery';
import { usePresentation } from '../../game/presentation/PresentationProvider';
import { buildDeedCardModel } from '../../game/ui/property/deedCardModel';
import PropertyDeedCard from '../../game/ui/property/PropertyDeedCard';
import './DecisionSheet.css';
import { useTranslation } from '../../i18n/I18n';
import { useLocalizedError } from '../../i18n/useLocalizedError';

export default function DevelopmentPrompt({ tokenArrived }: { tokenArrived: boolean }) {
  const { language, t } = useTranslation();
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
  const { error, clearError, setErrorKey, setAckError } = useLocalizedError();
  const requestGeneration = useRef(0);
  const deed = useMemo(
    () => (tileId !== null ? buildDeedCardModel({ tileId, state, roomPlayers, viewerPlayerId: playerId, language }) : null),
    [language, playerId, roomPlayers, state, tileId],
  );

  useEffect(() => {
    requestGeneration.current += 1;
    setPendingAction(null);
    clearError();
    return () => { requestGeneration.current += 1; };
  }, [canMutate, clearError, connected, operationId, playerId, presentationState.presentationResetEpoch, show, tokenArrived]);

  if (!show || !decision) return null;
  const player = playerId ? state.players[playerId] : undefined;
  const balance = player?.accountBalance ?? 0;
  const unitCost = decision.unitCost ?? 0;
  const max = decision.maxQuantity ?? 1;
  const total = unitCost * max;
  const tileName = getTileName(decision.tileID, language);
  const affordableHouses = unitCost > 0 ? Math.min(max, Math.floor(balance / unitCost)) : max;
  const isHouses = decision.kind === 'DEVELOP_HOUSES';
  // 2v2 Team Investment: the lander pays from their own cash for a street a teammate owns; the owner never changes.
  const investmentOwner = deed?.owner && deed.owner.playerId !== playerId ? deed.owner : null;
  // Why an option is disabled, in words: the shortfall for the cheapest step, or how many the balance covers.
  const reason = isHouses
    ? affordableHouses === 0
      ? t('development.shortHouses', { amount: formatMoney(unitCost - balance) })
      : affordableHouses < max ? t('development.maxHouses', { count: affordableHouses }) : null
    : balance < total ? t('development.shortHotel', { amount: formatMoney(total - balance) }) : null;
  const submit = (action: 'BUILD_HOUSES' | 'UPGRADE_HOTEL' | 'SKIP', quantity?: number) => {
    if (!operationId || pendingAction || (action === 'BUILD_HOUSES' && quantity === undefined)) return;
    const requestGenerationAtStart = requestGeneration.current + 1;
    requestGeneration.current = requestGenerationAtStart;
    setPendingAction(quantity ? `${action}:${quantity}` : action);
    clearError();
    const request = action === 'BUILD_HOUSES'
      ? socketFunctions.resolveDevelopment?.({ operationId, action, quantity: quantity as number })
      : socketFunctions.resolveDevelopment?.({ operationId, action });
    if (request === undefined && !socketFunctions.resolveDevelopment) {
      setPendingAction(null);
      setErrorKey('development.unavailable');
      return;
    }
    void Promise.resolve(request)
      .then(response => {
        if (requestGeneration.current !== requestGenerationAtStart || !response) return;
        if (!response.ok) {
          setPendingAction(null);
          setAckError(response.error);
        }
      })
      .catch(() => {
        if (requestGeneration.current !== requestGenerationAtStart) return;
        setPendingAction(null);
        setErrorKey('development.failed');
      });
  };
  return (
    <Modal
      open
      title={investmentOwner ? t('development.investTitle', { name: tileName }) : t('development.title', { name: tileName })}
      eyebrow={investmentOwner ? t('development.eyebrow.invest') : isHouses ? t('development.eyebrow.build') : t('development.eyebrow.upgrade')}
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
            <span>{isHouses ? t('development.houseCost') : t('development.upgradeCost')}</span>
            <strong>{formatMoney(unitCost)}</strong>
          </p>
          <dl className="decision-sheet__math">
            <div><dt>{t('development.balance')}</dt><dd>{formatMoney(balance)}</dd></div>
          </dl>
          {investmentOwner
            ? (
              <p className="decision-sheet__note decision-sheet__note--team">
                {t('development.investNote', { tile: tileName, owner: investmentOwner.name })}
              </p>
            )
            : null}
          {isHouses ? <p className="decision-sheet__note">{t('development.chooseHouses', { max, amount: formatMoney(unitCost) })}</p> : null}
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
                    {t('development.buildQuantity', { count: quantity, amount: formatMoney(unitCost * quantity) })}
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
                  {t('development.upgradeHotelButton', { amount: formatMoney(unitCost) })}
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
            >{t('dashboard.pass')}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
