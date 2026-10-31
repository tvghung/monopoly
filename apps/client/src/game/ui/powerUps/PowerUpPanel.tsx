import { useContext, useEffect, useRef, useState } from 'react';
import type { Ack, PowerUpOwnerState, ResolvePowerUpRequest } from '@monopoly/shared';
import { Sparkles } from 'lucide-react';
import stateContext from '../../../internal';
import Button from '../../../design-system/components/Button/Button';
import Modal from '../../../design-system/components/Modal/Modal';
import { useTranslation } from '../../../i18n/I18n';
import { en, vi, type MessageKey } from '../../../i18n/catalog';
import { usePresentationSelector } from '../../presentation/usePresentationSelector';
import { selectCardPresentation, selectPresentationStatus } from '../../presentation/store/selectors';
import PowerUpFeedback from './PowerUpFeedback';
import PowerUpCard from './PowerUpCard';
import PowerUpPickerCard from './PowerUpPickerCard';
import PowerUpArtwork from './PowerUpArtwork';
import PowerUpRuntimePanels, { PowerUpActivationDialog } from './PowerUpRuntimePanels';
import './PowerUps.css';

type Offer = PowerUpOwnerState['offers'][number];
function RewardDecision({ offer, inventory }: { offer: Offer; inventory: PowerUpOwnerState['inventory'] }) {
  const { t } = useTranslation();
  const { canMutate, connected, socketFunctions } = useContext(stateContext);
  const [busy, setBusy] = useState(false);
  const [tentative, setTentative] = useState<number | null>(null);
  const [selectionSubmitted, setSelectionSubmitted] = useState(false);
  const [burstIndex, setBurstIndex] = useState<number | null>(null);
  const selectionPending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const revealed = offer.candidates.every(candidate => candidate.definition !== undefined);
  const locked = offer.selectedIndex !== null;
  const full = (inventory?.cards.length ?? 0) >= (inventory?.capacity ?? 3);
  const enabled = canMutate && connected && !busy;
  useEffect(() => {
    if (burstIndex === null) return undefined;
    const timer = window.setTimeout(() => setBurstIndex(null), 720);
    return () => window.clearTimeout(timer);
  }, [burstIndex]);
  const send = async (invoke: (() => Promise<Ack>) | undefined): Promise<Ack | undefined> => {
    if (!invoke || inFlight.current || !enabled) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { const ack = await invoke(); if (!ack.ok) setError(ack.error.message); return ack; }
    catch { setError(t('powerup.retry')); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const select = async (index: number) => {
    if (locked || selectionPending.current || inFlight.current || !enabled || !socketFunctions.selectPowerUp) return;
    // A successful ACK can arrive before its snapshot; keep the choice latched across that gap.
    selectionPending.current = true; setSelectionSubmitted(true); setTentative(index); setBurstIndex(index);
    const ack = await send(() => socketFunctions.selectPowerUp!({ offerId: offer.offerId, selectedIndex: index }));
    if (!ack?.ok) {
      selectionPending.current = false; setSelectionSubmitted(false); setTentative(null); setBurstIndex(null);
    }
  };
  const waitingForSelection = selectionSubmitted && !locked;
  const resolve = (request: ResolvePowerUpRequest) => void send(socketFunctions.resolvePowerUp ? () => socketFunctions.resolvePowerUp!(request) : undefined);
  return <Modal open title={t('powerup.title')} eyebrow={t('powerup.earned')} size="xl" tone="celebration" peek="decision" peekKey={offer.offerId}
    closeOnEscape={false} className="power-up-reward" footer={revealed ? <div className="power-up-actions">
      {!full ? <Button busy={busy} disabled={!enabled} onClick={() => resolve({ offerId: offer.offerId, action: 'CLAIM' })}>{t('powerup.claim')}</Button> : null}
      <Button variant="secondary" disabled={!enabled} onClick={() => resolve({ offerId: offer.offerId, action: 'DECLINE' })}>{t('powerup.decline')}</Button>
    </div> : undefined}>
    <div className="power-up-grid power-up-picker-grid" aria-busy={busy || waitingForSelection}>
      {offer.candidates.map((candidate, index) => <PowerUpPickerCard key={candidate.category} {...candidate}
        position={index} burst={burstIndex === index} animateReveal={revealed && tentative !== null}
        selected={(offer.selectedIndex ?? tentative) === index} discarded={revealed && offer.selectedIndex !== index}
        disabled={!enabled || locked || waitingForSelection} onChoose={revealed ? undefined : () => { void select(index); }} />)}
    </div>
    <div role="status" aria-live="polite">{busy || waitingForSelection ? t('powerup.loading') : locked ? t('powerup.selected') : ''}</div>
    {error ? <p role="alert" className="power-up-error">{error}</p> : null}
    {revealed && full ? <section className="power-up-replacement"><p>{t('powerup.full')}</p><div className="power-up-grid">
      {inventory?.cards.map(card => <div key={card.instanceId}><PowerUpCard category={card.definition.category} definition={card.definition} />
        <Button variant="secondary" disabled={!enabled} onClick={() => resolve({ offerId: offer.offerId, action: 'REPLACE', replaceInstanceId: card.instanceId })}>{t('powerup.replace')} · {card.definition.name}</Button></div>)}
    </div></section> : null}
  </Modal>;
}

export default function PowerUpPanel() {
  const { t } = useTranslation();
  const { state, playerId, role, privatePlayerState, connected, canMutate } = useContext(stateContext);
  const status = usePresentationSelector(selectPresentationStatus);
  const cardPresentation = usePresentationSelector(selectCardPresentation);
  const [inspect, setInspect] = useState(false);
  const [detailInstanceId, setDetailInstanceId] = useState<string | null>(null);
  const [activationInstanceId, setActivationInstanceId] = useState<string | null>(null);
  const decisionAutoOpen = useRef<string | null>(null);
  const powerUps = privatePlayerState?.playerId === playerId ? privatePlayerState?.powerUps : undefined;
  const inventory = powerUps?.inventory;
  const detailCard = inventory?.cards.find(card => card.instanceId === detailInstanceId);
  const active = powerUps?.offers.find(offer => offer.offerId === powerUps.activeOfferId && offer.stage !== 'COMPLETED');
  const completed = powerUps?.offers.find(offer => offer.stage === 'COMPLETED');
  const activeCards = (inventory?.cards ?? []).filter(card => card.definition.activation === 'ACTIVE');
  const reactionEventId = powerUps?.reaction?.eventId;
  const tradeRequestId = powerUps?.tradeRequest?.requestId;
  const movementOperationId = powerUps?.movement?.operationId;
  const currentPlayerId = state.boardState.currentPlayer.id;
  const decision = state.turnInfo.pendingLandingDecision;
  const decisionOperationId = decision?.operationId;
  const requiredDecisionCard = decision?.kind === 'PURCHASE' ? 'U03' : decision ? 'U09' : null;
  const hasRequiredDecisionCard = activeCards.some(card => card.definitionId === requiredDecisionCard);
  const safeToShow = status === 'idle' && !cardPresentation && !state.turnInfo.pendingCardInteraction
    && !state.turnInfo.pendingLandingDecision && !state.boardState.paymentShortfall && !privatePlayerState?.forcedSaleProposal;
  const rewardOpen = Boolean(active && safeToShow && connected && role === 'PLAYER');
  useEffect(() => {
    if (powerUps?.activeUsedThisTurn || reactionEventId || tradeRequestId || movementOperationId
      || currentPlayerId !== playerId) setActivationInstanceId(null);
  }, [powerUps?.activeUsedThisTurn, reactionEventId, tradeRequestId, movementOperationId, currentPlayerId, playerId]);
  useEffect(() => {
    if (hasRequiredDecisionCard && decisionOperationId && decisionAutoOpen.current !== decisionOperationId) {
      decisionAutoOpen.current = decisionOperationId;
      setInspect(true);
    }
  }, [hasRequiredDecisionCard, decisionOperationId]);
  const activationUnavailableReason = (card: NonNullable<typeof inventory>['cards'][number]): string | null => {
    if (!connected) return t('powerup.disconnected');
    if (!canMutate || role !== 'PLAYER') return t('powerup.playerOnly');
    if (powerUps?.activeUsedThisTurn) return t('powerup.activeUsed');
    if (['U01', 'U02', 'U05', 'U08'].includes(card.definitionId)) {
      return powerUps?.movement ? null : t('powerup.waitForRoll');
    }
    if (card.definitionId === 'U03') return state.turnInfo.pendingLandingDecision?.kind === 'PURCHASE'
      && state.turnInfo.pendingLandingDecision.playerId === playerId ? null : t('powerup.waitForPurchase');
    if (card.definitionId === 'U09') return state.turnInfo.pendingLandingDecision
      && state.turnInfo.pendingLandingDecision.kind !== 'PURCHASE'
      && state.turnInfo.pendingLandingDecision.playerId === playerId ? null : t('powerup.waitForBuild');
    if (state.boardState.currentPlayer.id !== playerId) return t('powerup.waitForTurn');
    if (state.players[playerId ?? '']?.isJail) return t('powerup.unavailableInJail');
    if (state.boardState.currentPlayer.hasMoved) return t('powerup.beforeMovement');
    if (state.turnInfo.pendingLandingDecision || state.turnInfo.pendingCardInteraction || state.boardState.paymentShortfall) {
      return t('powerup.finishDecision');
    }
    return null;
  };
  return <>
    <PowerUpFeedback />
    <div className="power-up-dock">
      <Button variant="secondary" className="game-board__property-button" aria-label={t('powerup.inventory') + ' · ' + t('powerup.count', { count: inventory?.cards.length ?? 0, capacity: inventory?.capacity ?? 3 })} icon={<Sparkles size={16} />} onClick={() => setInspect(true)}><span className="dock-label">{t('powerup.inventory')}</span><span className="dock-count">{inventory?.cards.length ?? 0} / {inventory?.capacity ?? 3}</span></Button>
      {completed?.outcome && completed.outcome.kind !== 'CANCELLED' ? <span role="status" className="power-up-outcome">{t(('powerup.' + completed.outcome.kind) as 'powerup.GRANTED')}</span> : null}
    </div>
    {rewardOpen && active ? <RewardDecision key={active.offerId} offer={active} inventory={inventory ?? null} /> : null}
    <PowerUpRuntimePanels />
    {activationInstanceId && inventory ? (() => {
      const card = inventory.cards.find(item => item.instanceId === activationInstanceId);
      return card ? <PowerUpActivationDialog key={activationInstanceId} card={card} onClose={() => setActivationInstanceId(null)} /> : null;
    })() : null}
    <Modal open={Boolean(detailCard) && !rewardOpen && !powerUps?.reaction && !powerUps?.tradeRequest && !powerUps?.movement}
      title={detailCard?.definition.name ?? ''} eyebrow={t('powerup.details')} size="md" className="power-up-detail"
      onClose={() => { setDetailInstanceId(null); setInspect(true); }} peek="view">
      {detailCard ? <PowerUpCard category={detailCard.definition.category} definition={detailCard.definition} /> : null}
    </Modal>
    <Modal open={inspect && !rewardOpen && !powerUps?.reaction && !powerUps?.tradeRequest && !powerUps?.movement}
      title={t('powerup.inventory')} onClose={() => setInspect(false)} size="xl" peek="view">
      <p>{t('powerup.count', { count: inventory?.cards.length ?? 0, capacity: inventory?.capacity ?? 3 })}</p>
      {!inventory?.cards.length ? <p>{t('powerup.empty')}</p> : <div className="power-up-grid">{inventory.cards.map(card => <div key={card.instanceId}>
        <PowerUpCard category={card.definition.category} definition={card.definition} />
        <Button variant="ghost" className="power-up-card-details" onClick={() => { setInspect(false); setDetailInstanceId(card.instanceId); }}>{t('powerup.details')} · {card.definition.name}</Button>
        {card.definition.activation === 'ACTIVE' ? (() => {
          const reason = activationUnavailableReason(card);
          return <>
            <Button variant="secondary" disabled={Boolean(reason)} onClick={() => {
              setInspect(false);
              setActivationInstanceId(card.instanceId);
            }}>{t('powerup.activate')}</Button>
            {reason ? <p className="power-up-availability">{reason}</p> : null}
          </>;
        })() : null}
      </div>)}</div>}
      <h3>{t('powerup.statuses')}</h3>
      {(powerUps?.statuses?.length ?? 0) === 0 ? <p>{t('powerup.noStatuses')}</p> : <ul className="power-up-summaries">{powerUps?.statuses?.map(status => {
        const key = `powerup.effect.${status.definitionId}`;
        const description = key in vi && key in en ? t(key as MessageKey) : status.description;
        return <li key={status.statusId}>
          <div className="power-up-status-art"><PowerUpArtwork category={status.definitionId.startsWith('A') ? 'ATTACK' : status.definitionId.startsWith('D') ? 'DEFENSE' : 'UTILITY'} definitionId={status.definitionId} thumbnail /><div><strong>{status.name ?? status.definitionId}</strong><p>{description}</p></div></div><span>{status.kind}</span>
          {status.remainingOwnerTurns !== undefined ? <span>{t('powerup.turnsRemaining', { count: status.remainingOwnerTurns })}</span> : null}
          {status.remainingUses !== undefined ? <span>{t('powerup.usesRemaining', { count: status.remainingUses })}</span> : null}
        </li>;
      })}</ul>}
      <h3>{t('powerup.opponents')}</h3>
      <ul className="power-up-summaries">{Object.entries(state.players).filter(([id]) => id !== playerId).map(([id, player]) => <li key={id}>
        <strong>{player.name}</strong><span>{t('powerup.count', { count: player.powerUps?.count ?? 0, capacity: 3 })}</span>
        <span>{t('powerup.ATTACK')}: {player.powerUps?.categories.ATTACK ?? 0} · {t('powerup.DEFENSE')}: {player.powerUps?.categories.DEFENSE ?? 0} · {t('powerup.UTILITY')}: {player.powerUps?.categories.UTILITY ?? 0}</span>
      </li>)}</ul>
    </Modal>
  </>;
}
