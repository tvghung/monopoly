import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { colorGroups, getTeammateIds, tileState } from '@monopoly/shared';
import { ShoppingCart, X } from 'lucide-react';
import stateContext from '../../internal';
import { formatMoney, getTileName } from '../../presentation';
import Modal from '../../design-system/components/Modal/Modal';
import Button from '../../design-system/components/Button/Button';
import { SHORT_VIEWPORT_QUERY, useMediaQuery } from '../../design-system/useMediaQuery';
import { usePresentation } from '../../game/presentation/PresentationProvider';
import { buildDeedCardModel } from '../../game/ui/property/deedCardModel';
import PropertyDeedCard from '../../game/ui/property/PropertyDeedCard';
import './DecisionSheet.css';
import { useTranslation, type Language } from '../../i18n/I18n';
import { translate } from '../../i18n/I18n';
import { useLocalizedError } from '../../i18n/useLocalizedError';

/**
 * "Sở hữu 2/3 nhóm Xanh nhạt sau khi mua", or null when the purchase does not bring the group closer in a way worth saying. In 2v2
 * the buyer's teammates are passed too: the colour set belongs to the team, so their streets count and the hint speaks of "cả đội".
 */
export function groupProgressHint(
  tileId: number,
  ownerId: string | undefined,
  ownedProps: Record<number, { id: string }>,
  teammateIds: readonly string[] = [],
  language: Language = 'vi',
): string | null {
  const tile = tileState[tileId];
  if (!tile || !ownerId) return null;
  const tiles = tile.tileType === 'normal' && tile.color ? colorGroups[tile.color] : undefined;
  if (!tiles || tiles.length < 2) return null;
  const holds = (holderId: string | undefined) => holderId !== undefined && (holderId === ownerId || teammateIds.includes(holderId));
  const after = tiles.filter(groupTileId => groupTileId === tileId || holds(ownedProps[groupTileId]?.id)).length;
  const labelKeys: Record<string, Parameters<typeof translate>[0]> = {
    brown: 'property.colorGroup.brown', lightblue: 'property.colorGroup.lightblue', pink: 'property.colorGroup.pink',
    orange: 'property.colorGroup.orange', red: 'property.colorGroup.red', yellow: 'property.colorGroup.yellow',
    green: 'property.colorGroup.green', blue: 'property.colorGroup.blue',
  };
  const label = translate(labelKeys[tile.color ?? ''] ?? 'property.colorGroup.brown', language).toLowerCase();
  if (after === tiles.length) {
    return translate(teammateIds.length > 0 ? 'buy.groupComplete' : 'buy.groupCompleteSolo', language, { group: label });
  }
  return after >= 2
    ? translate(teammateIds.length > 0 ? 'buy.groupProgress' : 'buy.groupProgressSolo', language, { owned: after, total: tiles.length, group: label })
    : null;
}

export default function BuyPrompt({ tokenArrived }: { tokenArrived: boolean }) {
  const { language, t } = useTranslation();
  const {
    state, socketFunctions, playerId, canMutate, connected, roomPlayers,
  } = useContext(stateContext);
  const { state: presentationState } = usePresentation();
  const short = useMediaQuery(SHORT_VIEWPORT_QUERY);
  const [pendingAction, setPendingAction] = useState<'BUY' | 'DECLINE' | null>(null);
  const { error, clearError, setErrorKey, setAckError } = useLocalizedError();
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
  const deed = useMemo(
    () => (show && typeof tileId === 'number' ? buildDeedCardModel({ tileId, state, roomPlayers, language }) : null),
    [language, roomPlayers, show, state, tileId],
  );

  useEffect(() => {
    requestGeneration.current += 1;
    setPendingAction(null);
    clearError();
    return () => { requestGeneration.current += 1; };
  }, [canMutate, clearError, connected, operationId, playerId, presentationState.presentationResetEpoch, show, tokenArrived]);

  const submit = (action: 'BUY' | 'DECLINE') => {
    if (pending?.kind !== 'PURCHASE' || pendingAction || !operationId) return;
    const requestGenerationAtStart = requestGeneration.current + 1;
    requestGeneration.current = requestGenerationAtStart;
    setPendingAction(action);
    clearError();
    const request = action === 'BUY'
      ? socketFunctions.buyProperty(operationId)
      : socketFunctions.doNotBuy?.(operationId);
    if (request === undefined && action === 'DECLINE' && !socketFunctions.doNotBuy) {
      setPendingAction(null);
      setErrorKey('buy.dismissUnavailable');
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
        setErrorKey('buy.actionFailed');
      });
  };

  const price = typeof tile?.price === 'number' ? tile.price : null;
  const balance = player?.accountBalance ?? 0;
  const shortBy = price !== null && balance < price ? price - balance : 0;
  const hint = typeof tileId === 'number' ? groupProgressHint(tileId, playerId ?? undefined, state.boardState.ownedProps, playerId ? getTeammateIds(state, playerId) : [], language) : null;
  const name = typeof tileId === 'number' ? getTileName(tileId, language) : null;

  return (
    <Modal
      open={show}
      title={name ? t('buy.title', { name }) : t('buy.genericTitle')}
      eyebrow={t('buy.eyebrow')}
      size="lg"
      placement="sheet"
      backdrop="clear"
      className="decision-sheet buy-prompt"
    >
      <div className={`decision-sheet__layout${short ? ' decision-sheet__layout--compact' : ''}`}>
        {deed ? (
          <PropertyDeedCard
            model={deed}
            variant={short ? 'compact' : 'full'}
            showOwner={false}
            className="decision-sheet__deed"
          />
        ) : null}
        <div className="decision-sheet__decision">
          {price !== null ? (
            <p className="decision-sheet__price">
              <span>{t('buy.price')}</span>
              <strong>{formatMoney(price)}</strong>
            </p>
          ) : null}
          {price !== null ? (
            <dl className="decision-sheet__math">
              <div><dt>{t('buy.balance')}</dt><dd>{formatMoney(balance)}</dd></div>
              <div className={shortBy > 0 ? 'decision-sheet__math--short' : undefined}>
                <dt>{t('buy.after')}</dt>
                <dd>{shortBy > 0 ? `−${formatMoney(shortBy)}` : formatMoney(balance - price)}</dd>
              </div>
            </dl>
          ) : null}
          {hint ? <p className="decision-sheet__hint">{hint}</p> : null}
          {shortBy > 0 ? (
            <p className="decision-sheet__reason" role="note">{t('buy.shortfall', { amount: formatMoney(shortBy) })}</p>
          ) : null}
          {error ? <p className="decision-sheet__error" role="alert">{error}</p> : null}
          <div className="decision-sheet__actions">
            <Button
              data-modal-autofocus
              size="lg"
              icon={<ShoppingCart />}
              type="button"
              busy={pendingAction === 'BUY'}
              disabled={pendingAction !== null || shortBy > 0}
              onClick={() => submit('BUY')}
            >{t('buy.confirm')}</Button>
            <Button
              variant="secondary"
              size="lg"
              icon={<X />}
              type="button"
              busy={pendingAction === 'DECLINE'}
              disabled={pendingAction !== null}
              onClick={() => submit('DECLINE')}
            >{t('buy.decline')}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
