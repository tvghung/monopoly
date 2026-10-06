import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { colorGroups, getTeammateIds, tileState } from '@monopoly/shared';
import { ShoppingCart, X } from 'lucide-react';
import stateContext from '../../internal';
import { formatMoney, getTileName, localizeAckError } from '../../presentation';
import Modal from '../../design-system/components/Modal/Modal';
import Button from '../../design-system/components/Button/Button';
import { SHORT_VIEWPORT_QUERY, useMediaQuery } from '../../design-system/useMediaQuery';
import { usePresentation } from '../../game/presentation/PresentationProvider';
import { buildDeedCardModel } from '../../game/ui/property/deedCardModel';
import PropertyDeedCard from '../../game/ui/property/PropertyDeedCard';
import { getPropertyGroupVisualStyle } from '../../game/ui/propertyVisualColors';
import './DecisionSheet.css';

/**
 * "Sở hữu 2/3 nhóm Xanh nhạt sau khi mua", or null when the purchase does not bring the group closer in a way worth saying. In 2v2
 * the buyer's teammates are passed too: the colour set belongs to the team, so their streets count and the hint speaks of "cả đội".
 */
export function groupProgressHint(
  tileId: number,
  ownerId: string | undefined,
  ownedProps: Record<number, { id: string }>,
  teammateIds: readonly string[] = [],
): string | null {
  const tile = tileState[tileId];
  if (!tile || !ownerId) return null;
  const tiles = tile.tileType === 'normal' && tile.color ? colorGroups[tile.color] : undefined;
  if (!tiles || tiles.length < 2) return null;
  const holds = (holderId: string | undefined) => holderId !== undefined && (holderId === ownerId || teammateIds.includes(holderId));
  const after = tiles.filter(groupTileId => groupTileId === tileId || holds(ownedProps[groupTileId]?.id)).length;
  const label = getPropertyGroupVisualStyle(tile.color).label.toLowerCase();
  const subject = teammateIds.length > 0 ? 'Cả đội' : null;
  if (after === tiles.length) return subject ? `${subject} hoàn thành ${label} sau khi mua` : `Hoàn thành ${label} sau khi mua`;
  return after >= 2 ? `${subject ?? 'Sở hữu'}${subject ? ' sở hữu' : ''} ${after}/${tiles.length} ${label} sau khi mua` : null;
}

export default function BuyPrompt({ tokenArrived }: { tokenArrived: boolean }) {
  const {
    state, socketFunctions, playerId, canMutate, connected, roomPlayers,
  } = useContext(stateContext);
  const { state: presentationState } = usePresentation();
  const short = useMediaQuery(SHORT_VIEWPORT_QUERY);
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
  const deed = useMemo(
    () => (show && typeof tileId === 'number' ? buildDeedCardModel({ tileId, state, roomPlayers }) : null),
    [roomPlayers, show, state, tileId],
  );

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

  const price = typeof tile?.price === 'number' ? tile.price : null;
  const balance = player?.accountBalance ?? 0;
  const shortBy = price !== null && balance < price ? price - balance : 0;
  const hint = typeof tileId === 'number' ? groupProgressHint(tileId, playerId ?? undefined, state.boardState.ownedProps, playerId ? getTeammateIds(state, playerId) : []) : null;
  const name = typeof tileId === 'number' ? getTileName(tileId) : null;

  return (
    <Modal
      open={show}
      title={name ? `Mua ${name}?` : 'Mua tài sản này?'}
      eyebrow="Ô đất trống"
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
              <span>Giá mua</span>
              <strong>{formatMoney(price)}</strong>
            </p>
          ) : null}
          {price !== null ? (
            <dl className="decision-sheet__math">
              <div><dt>Số dư hiện tại</dt><dd>{formatMoney(balance)}</dd></div>
              <div className={shortBy > 0 ? 'decision-sheet__math--short' : undefined}>
                <dt>Số dư sau khi mua</dt>
                <dd>{shortBy > 0 ? `−${formatMoney(shortBy)}` : formatMoney(balance - price)}</dd>
              </div>
            </dl>
          ) : null}
          {hint ? <p className="decision-sheet__hint">{hint}</p> : null}
          {shortBy > 0 ? (
            <p className="decision-sheet__reason" role="note">{`Bạn còn thiếu ${formatMoney(shortBy)} để mua ô đất này.`}</p>
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
            >Mua tài sản</Button>
            <Button
              variant="secondary"
              size="lg"
              icon={<X />}
              type="button"
              busy={pendingAction === 'DECLINE'}
              disabled={pendingAction !== null}
              onClick={() => submit('DECLINE')}
            >Không mua</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
