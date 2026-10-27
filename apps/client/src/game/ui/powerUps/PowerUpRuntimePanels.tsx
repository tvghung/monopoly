import { useContext, useEffect, useRef, useState } from 'react';
import {
  POWER_UP_CATEGORIES,
  formatMoney,
  tileState,
  type Ack,
  type PowerUpActivationRequest,
  type PowerUpOwnerState,
} from '@monopoly/shared';
import stateContext from '../../../internal';
import Button from '../../../design-system/components/Button/Button';
import Modal from '../../../design-system/components/Modal/Modal';
import { useTranslation } from '../../../i18n/I18n';
import { presentationStoreContext } from '../../presentation/PresentationProvider';
import PowerUpCard from './PowerUpCard';
import './PowerUps.css';

export type OwnedPowerUp = NonNullable<PowerUpOwnerState['inventory']>['cards'][number];
const movementCards = new Set(['U01', 'U02', 'U05', 'U08']);
const playerTargetCards = new Set(['A01', 'A03', 'A04', 'A05', 'A06', 'A07', 'A09', 'A10', 'U06']);
const propertyTargetCards = new Set(['A02', 'A04', 'D04', 'U03', 'U07', 'U08']);
const negativeStatusIds = new Set(['A03', 'A04', 'A05', 'A07', 'A08', 'A10']);
const propertyOptions = Object.entries(tileState).flatMap(([key, tile]) => {
  const tileID = Number(key);
  return tile && ['normal', 'railroad', 'company'].includes(tile.tileType) && (tile.price ?? 0) > 0
    ? [{ tileID, label: tile.streetName ?? `Tile ${tileID}` }]
    : [];
});

export function PowerUpActivationDialog({ card, onClose }: { card: OwnedPowerUp; onClose: () => void }) {
  const { t } = useTranslation();
  const presentation = useContext(presentationStoreContext);
  const { state, playerId, canMutate, connected, role, privatePlayerState, socketFunctions } = useContext(stateContext);
  const powerUps = privatePlayerState?.playerId === playerId ? privatePlayerState.powerUps : undefined;
  const inventory = powerUps?.inventory;
  const id = card.definitionId;
  const [targetPlayerId, setTargetPlayerId] = useState('');
  const [targetTileID, setTargetTileID] = useState<number | null>(null);
  const [movementDelta, setMovementDelta] = useState(0);
  const [ingredientInstanceIds, setIngredientInstanceIds] = useState<string[]>([]);
  const [transformedInstanceId, setTransformedInstanceId] = useState('');
  const [category, setCategory] = useState<(typeof POWER_UP_CATEGORIES)[number]>('ATTACK');
  const [statusId, setStatusId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const ownPlayer = playerId ? state.players[playerId] : undefined;
  const activePlayerIds = new Set(state.boardState.players);
  const opponents = Object.entries(state.players).filter(([otherId, player]) => (
    otherId !== playerId && activePlayerIds.has(otherId)
    && (state.boardState.gameMode !== 'TEAM_2V2' || player.teamId !== ownPlayer?.teamId)
  ));
  const eligibleTargets = opponents.filter(([targetId, player]) => {
    if (id === 'A01') return player.accountBalance > 0;
    if (id === 'A06' || id === 'U06') return (player.powerUps?.count ?? 0) > 0;
    if (id === 'A09') return Object.values(state.boardState.ownedProps).some(property => property.id === targetId && property.houses > 0);
    return true;
  });
  const ownProperties = Object.entries(state.boardState.ownedProps).flatMap(([tile, property]) => (
    property.id === playerId ? [{ tileID: Number(tile), label: propertyOptions.find(option => option.tileID === Number(tile))?.label ?? `Tile ${tile}` }] : []
  ));
  const targetProperties = Object.entries(state.boardState.ownedProps).flatMap(([tile, property]) => (
    property.id === targetPlayerId ? [{ tileID: Number(tile), label: propertyOptions.find(option => option.tileID === Number(tile))?.label ?? `Tile ${tile}` }] : []
  ));
  const unownedProperties = propertyOptions.filter(option => !state.boardState.ownedProps[option.tileID]);
  const eligibleIngredients = (inventory?.cards ?? []).filter(item => item.instanceId !== card.instanceId
    && item.definitionId !== 'U04' && item.definition.rarity !== 'LEGENDARY');
  const transformTargets = (inventory?.cards ?? []).filter(item => item.instanceId !== card.instanceId
    && item.definition.rarity !== 'LEGENDARY');
  const removableStatuses = (powerUps?.statuses ?? []).filter(status => negativeStatusIds.has(status.definitionId));
  const ingredientIdentity = eligibleIngredients.map(item => item.instanceId).join(':');
  const transformIdentity = transformTargets.map(item => item.instanceId).join(':');
  const statusIdentity = removableStatuses.map(status => status.statusId).join(':');
  const decision = state.turnInfo.pendingLandingDecision;
  const pendingProperty = decision?.kind === 'PURCHASE' && decision.playerId === playerId ? decision : null;
  const pendingDevelopment = decision && decision.kind !== 'PURCHASE' && decision.playerId === playerId ? decision : null;
  const pendingPropertyTileID = pendingProperty?.tileID ?? null;
  const pendingMovement = powerUps?.movement;
  const normalTurn = state.boardState.currentPlayer.id === playerId && !state.boardState.currentPlayer.hasMoved
    && !decision && !state.turnInfo.pendingCardInteraction && !state.boardState.paymentShortfall;
  const timingAvailable = movementCards.has(id) ? Boolean(pendingMovement)
    : id === 'U03' ? Boolean(pendingProperty)
      : id === 'U09' ? Boolean(pendingDevelopment)
        : normalTurn;
  const enabled = canMutate && connected && role === 'PLAYER' && !busy && timingAvailable
    && !powerUps?.activeUsedThisTurn;
  const requiresTarget = playerTargetCards.has(id);
  const requiresProperty = propertyTargetCards.has(id);
  const propertyChoices = id === 'A02' || id === 'D04' ? ownProperties
    : id === 'A04' ? targetProperties
      : id === 'U03' && pendingProperty ? [{ tileID: pendingProperty.tileID, label: propertyOptions.find(option => option.tileID === pendingProperty.tileID)?.label ?? `Tile ${pendingProperty.tileID}` }]
        : id === 'U07' ? unownedProperties : propertyOptions;
  const targetKey = propertyChoices.map(option => option.tileID).join(':');
  useEffect(() => {
    if (!requiresProperty || !enabled) return;
    presentation?.store.setPowerUpTargets?.({ validTileIds: targetKey ? targetKey.split(':').map(Number) : [], selectedTileId: targetTileID });
    return () => presentation?.store.setPowerUpTargets?.(null);
  }, [presentation, requiresProperty, enabled, targetKey, targetTileID]);
  const formValid = (!requiresTarget || eligibleTargets.some(([candidate]) => candidate === targetPlayerId))
    && (!requiresProperty || (id === 'U03' ? Boolean(pendingProperty)
      : propertyChoices.some(option => option.tileID === targetTileID)))
    && (id !== 'U04' || ingredientInstanceIds.length === 2
      && ingredientInstanceIds.every(instanceId => eligibleIngredients.some(item => item.instanceId === instanceId)))
    && (id !== 'U10' || transformTargets.some(item => item.instanceId === transformedInstanceId) && Boolean(category))
    && (id !== 'D10' || removableStatuses.some(status => status.statusId === statusId));

  useEffect(() => {
    if (id === 'U03' && pendingPropertyTileID !== null) setTargetTileID(pendingPropertyTileID);
    if (id === 'U04') setIngredientInstanceIds(ingredientIdentity ? ingredientIdentity.split(':').slice(0, 2) : []);
    if (id === 'U10' && transformIdentity) setTransformedInstanceId(transformIdentity.split(':')[0]);
    if (id === 'D10' && statusIdentity) setStatusId(statusIdentity.split(':')[0]);
  }, [id, pendingPropertyTileID, ingredientIdentity, transformIdentity, statusIdentity]);

  const activate = async () => {
    if (!socketFunctions.activatePowerUp || !enabled || !formValid || inFlight.current) return;
    const request: PowerUpActivationRequest = { instanceId: card.instanceId };
    if (requiresTarget) request.targetPlayerId = targetPlayerId;
    if (requiresProperty && id !== 'U03' && targetTileID !== null) request.targetTileID = targetTileID;
    if (id === 'U03' && pendingProperty) request.targetTileID = pendingProperty.tileID;
    if (id === 'U04') request.ingredientInstanceIds = ingredientInstanceIds;
    if (id === 'U05') request.movementDelta = movementDelta;
    if (id === 'U10') { request.transformedInstanceId = transformedInstanceId; request.category = category; }
    if (id === 'D10') request.statusId = statusId;
    inFlight.current = true; setBusy(true); setError(null);
    const feedbackEpoch = presentation?.store.getSnapshot().presentationResetEpoch;
    try {
      const ack = await socketFunctions.activatePowerUp(request);
      if (!ack.ok) setError(ack.error.message);
      else {
        const kind = card.definition.rarity === 'LEGENDARY' ? 'LEGENDARY' : card.definition.category === 'ATTACK' ? 'ATTACK' : null;
        if (kind && feedbackEpoch !== undefined) presentation?.showPowerUpFeedback?.(kind, id, card.definition.name, card.instanceId, feedbackEpoch);
        onClose();
      }
    } catch { setError(t('powerup.retry')); }
    finally { inFlight.current = false; setBusy(false); }
  };

  return <Modal open title={card.definition.name} eyebrow={t('powerup.activateTitle')} size="lg" peek="decision"
    closeOnEscape={!busy} onClose={busy ? undefined : onClose} className="power-up-activation"
    footer={<div className="power-up-actions"><Button variant="secondary" disabled={!enabled} onClick={onClose}>{t('powerup.decline')}</Button>
      <Button busy={busy} disabled={!enabled || !formValid} onClick={() => void activate()}>{t('powerup.activate')}</Button></div>}>
    <PowerUpCard category={card.definition.category} definition={card.definition} />
    {requiresProperty ? <p className="power-up-target-legend"><span>✓ {t('powerup.validTarget')}</span><span>— {t('powerup.invalidTarget')}</span></p> : null}
    <div className="power-up-form">
      {requiresTarget ? <label>{t('powerup.choosePlayer')}<select value={targetPlayerId} onChange={event => { setTargetPlayerId(event.target.value); setTargetTileID(null); }}>
        <option value="">—</option>{eligibleTargets.map(([otherId, player]) => <option key={otherId} value={otherId}>{player.name}</option>)}
      </select></label> : null}
      {requiresProperty ? <label>{t('powerup.chooseProperty')}<select value={targetTileID ?? (id === 'U03' ? pendingProperty?.tileID ?? '' : '')} onChange={event => setTargetTileID(event.target.value === '' ? null : Number(event.target.value))}>
        <option value="">—</option>{propertyOptions.map(option => { const valid = propertyChoices.some(choice => choice.tileID === option.tileID); return <option key={option.tileID} value={option.tileID} disabled={!valid}>{valid ? '✓ ' : '— '}{option.label}{valid ? '' : ' · ' + t('powerup.invalidTarget')}</option>; })}
      </select></label> : null}
      {id === 'U04' ? <fieldset><legend>{t('powerup.chooseIngredients')}</legend>{eligibleIngredients.map(item => <label key={item.instanceId}>
        <input type="checkbox" checked={ingredientInstanceIds.includes(item.instanceId)} disabled={!ingredientInstanceIds.includes(item.instanceId) && ingredientInstanceIds.length >= 2}
          onChange={() => setIngredientInstanceIds(selected => selected.includes(item.instanceId) ? selected.filter(value => value !== item.instanceId) : [...selected, item.instanceId])} />
        {item.definition.name}
      </label>)}</fieldset> : null}
      {id === 'U05' ? <label>{t('powerup.movementDelta')}<select value={movementDelta} onChange={event => setMovementDelta(Number(event.target.value))}>
        {[-3, -2, -1, 0, 1, 2, 3].map(value => <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}
      </select></label> : null}
      {id === 'U10' ? <><label>{t('powerup.chooseCard')}<select value={transformedInstanceId} onChange={event => setTransformedInstanceId(event.target.value)}>
        {transformTargets.map(item => <option key={item.instanceId} value={item.instanceId}>{item.definition.name}</option>)}
      </select></label><label>{t('powerup.chooseCategory')}<select value={category} onChange={event => setCategory(event.target.value as (typeof POWER_UP_CATEGORIES)[number])}>
        {POWER_UP_CATEGORIES.map(value => <option key={value} value={value}>{t(('powerup.' + value) as 'powerup.ATTACK')}</option>)}
      </select></label></> : null}
      {id === 'D10' ? <label>{t('powerup.chooseStatus')}<select value={statusId} onChange={event => setStatusId(event.target.value)}>
        {removableStatuses.map(status => <option key={status.statusId} value={status.statusId}>{status.definitionId} · {status.kind}</option>)}
      </select></label> : null}
      {requiresTarget && eligibleTargets.length === 0 ? <p className="power-up-availability">{t('powerup.noEligiblePlayer')}</p> : null}
      {requiresProperty && propertyChoices.length === 0 ? <p className="power-up-availability">{t('powerup.noEligibleProperty')}</p> : null}
      {id === 'U04' && eligibleIngredients.length < 2 ? <p className="power-up-availability">{t('powerup.needIngredients')}</p> : null}
      {id === 'U10' && transformTargets.length === 0 ? <p className="power-up-availability">{t('powerup.noTransformTarget')}</p> : null}
      {id === 'D10' && removableStatuses.length === 0 ? <p className="power-up-availability">{t('powerup.noRemovableStatus')}</p> : null}
    </div>
    {error ? <p role="alert" className="power-up-error">{error}</p> : null}
  </Modal>;
}

export default function PowerUpRuntimePanels() {
  const { t } = useTranslation();
  const presentation = useContext(presentationStoreContext);
  const { state, playerId, canMutate, connected, role, privatePlayerState, socketFunctions } = useContext(stateContext);
  const powerUps = privatePlayerState?.playerId === playerId ? privatePlayerState.powerUps : undefined;
  const inventory = powerUps?.inventory;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirectTileID, setRedirectTileID] = useState<number | null>(null);
  const [reactionSeconds, setReactionSeconds] = useState(0);
  const inFlight = useRef(false);
  const reaction = powerUps?.reaction;
  const reactionEventId = reaction?.eventId;
  const reactionDeadlineAt = reaction?.deadlineAt;
  const tradeRequest = powerUps?.tradeRequest;
  const movement = powerUps?.movement;
  const attackerProperties = Object.entries(state.boardState.ownedProps).flatMap(([tile, property]) => (
    property.id === reaction?.attackerPlayerId
      ? [{ tileID: Number(tile), label: propertyOptions.find(option => option.tileID === Number(tile))?.label ?? `Tile ${tile}` }]
      : []
  ));
  const enabled = canMutate && connected && role === 'PLAYER' && !busy;
  const send = async (invoke: (() => Promise<Ack>) | undefined, reactedCard?: OwnedPowerUp) => {
    if (!invoke || !enabled || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    const feedbackEpoch = presentation?.store.getSnapshot().presentationResetEpoch;
    try {
      const ack = await invoke();
      if (!ack.ok) setError(ack.error.message);
      else if (reactedCard && feedbackEpoch !== undefined) {
        const kind = reactedCard.definitionId === 'D05' ? 'REFLECT' : ['D02','D03','D06','D09'].includes(reactedCard.definitionId) ? 'BLOCK' : reactedCard.definition.rarity === 'LEGENDARY' ? 'LEGENDARY' : null;
        if (kind) presentation?.showPowerUpFeedback?.(kind, reactedCard.definitionId, reactedCard.definition.name, reactedCard.instanceId, feedbackEpoch);
      }
    }
    catch { setError(t('powerup.retry')); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const reactionTitle = reaction?.kind === 'ATTACK' ? t('powerup.reaction', { name: reaction.attackerName ?? '' })
    : reaction?.kind === 'RENT' ? t('powerup.rentReaction') : t('powerup.shortfallReaction');
  useEffect(() => {
    if (!reactionDeadlineAt) return;
    const update = () => setReactionSeconds(Math.max(0, Math.ceil((Date.parse(reactionDeadlineAt) - Date.now()) / 1_000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [reactionEventId, reactionDeadlineAt]);
  return <>
    {reaction ? <Modal open title={t('powerup.reactionNeeded')} eyebrow={reactionTitle}
      size={reaction.eligibleInstanceIds.length > 2 ? 'lg' : 'md'} peek="decision"
      closeOnEscape={false} className="power-up-reaction" footer={<Button variant="secondary" disabled={busy}
        onClick={() => void send(socketFunctions.respondPowerUp ? () => socketFunctions.respondPowerUp!({ eventId: reaction.eventId, action: 'PASS' }) : undefined)}>{t('powerup.pass')}</Button>}>
      <div className="power-up-grid">{reaction.eligibleInstanceIds.map(instanceId => {
        const item = inventory?.cards.find(card => card.instanceId === instanceId);
        if (!item) return null;
        const needsRedirect = item.definitionId === 'D05' && reaction.attackDefinitionId === 'A04';
        return <div key={instanceId} className="power-up-reaction-option"><PowerUpCard category={item.definition.category} definition={item.definition} />
          {needsRedirect ? <label>{t('powerup.chooseProperty')}<select value={redirectTileID ?? ''} onChange={event => setRedirectTileID(event.target.value === '' ? null : Number(event.target.value))}>
            <option value="">—</option>{attackerProperties.map(option => <option key={option.tileID} value={option.tileID}>{option.label}</option>)}
          </select></label> : null}
          <Button disabled={!enabled || reactionSeconds === 0 || (needsRedirect && redirectTileID === null)} onClick={() => void send(socketFunctions.respondPowerUp ? () => socketFunctions.respondPowerUp!({
            eventId: reaction.eventId, action: 'REACT', instanceId,
            ...(needsRedirect && redirectTileID !== null ? { redirectTileID } : {}),
          }) : undefined, item)}>{t('powerup.activate')}</Button>
        </div>;
      })}</div>
      {reaction.kind === 'ATTACK' ? <p className="power-up-threat">{t('powerup.incomingAttack', {
        attacker: reaction.attackerName ?? '', name: reaction.attackName ?? reaction.attackDefinitionId ?? '',
      })}</p> : null}
      {reaction.kind === 'RENT' ? <p className="power-up-threat">{t('powerup.incomingRent', {
        landlord: reaction.attackerName ?? '',
        property: propertyOptions.find(option => option.tileID === reaction.targetTileID)?.label ?? '',
        amount: formatMoney(reaction.rentAmount ?? 0),
      })}</p> : null}
      <p className="power-up-countdown" role="timer" aria-live="off" aria-label={t('powerup.secondsRemaining', { seconds: reactionSeconds })}>
        {t('powerup.secondsRemaining', { seconds: reactionSeconds })}
      </p>
      {error ? <p role="alert" className="power-up-error">{error}</p> : null}
    </Modal> : null}
    {tradeRequest ? <Modal open title={t('powerup.reactionNeeded')} eyebrow={t('powerup.tradeRequest', { name: tradeRequest.initiatorName })}
      size="md" peek="decision" closeOnEscape={false} footer={<div className="power-up-actions">
        <Button variant="secondary" disabled={busy} onClick={() => void send(socketFunctions.resolvePowerUpTrade ? () => socketFunctions.resolvePowerUpTrade!({ requestId: tradeRequest.requestId, accept: false }) : undefined)}>{t('powerup.declineTrade')}</Button>
        <Button disabled={busy} onClick={() => void send(socketFunctions.resolvePowerUpTrade ? () => socketFunctions.resolvePowerUpTrade!({ requestId: tradeRequest.requestId, accept: true }) : undefined)}>{t('powerup.acceptTrade')}</Button>
      </div>}>
      <div className="power-up-grid">{inventory?.cards.map(item => <PowerUpCard key={item.instanceId} category={item.definition.category} definition={item.definition} />)}</div>
      {error ? <p role="alert" className="power-up-error">{error}</p> : null}
    </Modal> : null}
    {movement ? <Modal open title={t('powerup.reactionNeeded')} eyebrow={t('powerup.movementWaiting')} size="md"
      peek="decision" closeOnEscape={false} footer={<Button busy={busy} disabled={!canMutate || !connected || role !== 'PLAYER'}
        onClick={() => void send(socketFunctions.continuePowerUpMovement ? () => socketFunctions.continuePowerUpMovement!({ operationId: movement.operationId }) : undefined)}>{t('powerup.keepMovement', { total: movement.total })}</Button>}>
      <p>{t('powerup.keepMovement', { total: movement.total })}</p>
      {error ? <p role="alert" className="power-up-error">{error}</p> : null}
    </Modal> : null}
  </>;
}
