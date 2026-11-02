import { useContext, useEffect, useRef, useState } from 'react';
import stateContext from '../../../internal';
import Button from '../../../design-system/components/Button/Button';
import { ActionIcon } from '../../../design-system/icons/ActionIcon';
import { useTranslation } from '../../../i18n/I18n';
import { useLocalizedError } from '../../../i18n/useLocalizedError';
import { en, vi, type MessageKey } from '../../../i18n/catalog';
import PowerUpArtwork from './PowerUpArtwork';
import { usePresentationSelector } from '../../presentation/usePresentationSelector';
import { selectPresentationResetEpoch } from '../../presentation/store/selectors';
import './PowerUps.css';

type ContextKind = 'PURCHASE' | 'DEVELOPMENT';
export default function ContextualPowerUpPanel({kind, operationId, disabled=false, onBusyChange, onReturnToDecision}: {
  kind:ContextKind; operationId:string; disabled?:boolean; onBusyChange:(busy:boolean)=>void; onReturnToDecision?:()=>void;
}) {
  const {t}=useTranslation();
  const {state,playerId,role,canMutate,connected,privatePlayerState,socketFunctions}=useContext(stateContext);
  const resetEpoch=usePresentationSelector(selectPresentationResetEpoch);
  const powerUps=privatePlayerState?.playerId===playerId?privatePlayerState.powerUps:undefined;
  const decision=state.turnInfo.pendingLandingDecision;
  const [busy,setBusy]=useState(false);const {error,clearError,setAckError,setErrorKey}=useLocalizedError();const [skipped,setSkipped]=useState(false);
  const inFlight=useRef(false);const generation=useRef(0);
  useEffect(()=>{const epoch=++generation.current;inFlight.current=false;setBusy(false);clearError();return()=>{generation.current=epoch+1;onBusyChange(false)}},[onBusyChange,operationId,playerId,role,connected,canMutate,resetEpoch,clearError]);
  const validContext=decision?.operationId===operationId&&decision.playerId===playerId
    &&(kind==='PURCHASE'?decision.kind==='PURCHASE':decision.kind!=='PURCHASE')
    &&state.boardState.currentPlayer.id===playerId&&!state.turnInfo.pendingCardInteraction
    &&!state.boardState.paymentShortfall&&!powerUps?.reaction&&!powerUps?.tradeRequest&&!powerUps?.movement;
  const definitionId=kind==='PURCHASE'?'U03':'U09';
  const cards=(powerUps?.inventory?.cards??[]).filter(card=>card.ownerPlayerId===playerId
    &&card.definitionId===definitionId&&card.definition.activation==='ACTIVE');
  const visible=Boolean(validContext&&role==='PLAYER'&&canMutate&&!powerUps?.activeUsedThisTurn&&cards.length&&!skipped);
  const wasVisible=useRef(false);
  useEffect(()=>{if(wasVisible.current&&!visible)onReturnToDecision?.();wasVisible.current=visible},[visible,onReturnToDecision]);
  if(!visible)return null;
  const activate=async(instanceId:string)=>{
    if(inFlight.current||disabled||!connected||!socketFunctions.activatePowerUp||!decision)return;
    const requestGeneration=generation.current;inFlight.current=true;setBusy(true);onBusyChange(true);clearError();
    try{
      const ack=await socketFunctions.activatePowerUp({instanceId,operationId,...(kind==='PURCHASE'?{targetTileID:decision.tileID}:{})});
      if(generation.current!==requestGeneration)return;
      if(!ack.ok)setAckError(ack.error);else onReturnToDecision?.();
    }catch{if(generation.current===requestGeneration)setErrorKey('powerup.retry')}
    finally{if(generation.current===requestGeneration){inFlight.current=false;setBusy(false);onBusyChange(false)}}
  };
  return <section className="contextual-powerups" aria-label={t('powerup.contextTitle')} data-powerup-context={kind}>
    <h3>{t('powerup.contextTitle')}</h3>
    {cards.map(card=>{
      const key='powerup.effect.'+card.definitionId;const effect=key in vi&&key in en?t(key as MessageKey):card.definition.description;
      return <div className="contextual-powerups__card" key={card.instanceId}>
        <PowerUpArtwork category={card.definition.category} definitionId={card.definitionId} thumbnail />
        <div className="contextual-powerups__copy"><strong>{card.definition.name}</strong><span>{t('powerup.contextAvailable')}</span><p>{effect}</p></div>
        <Button icon={<ActionIcon name="confirm" size={16}/>} busy={busy} disabled={disabled||busy||!connected} onClick={()=>void activate(card.instanceId)}>{t('powerup.activate')}</Button>
      </div>;
    })}
    <Button variant="ghost" icon={<ActionIcon name="skip" size={16}/>} disabled={busy||disabled} onClick={()=>setSkipped(true)}>{t('powerup.skipContext')}</Button>
    {!connected?<p className="power-up-availability">{t('powerup.disconnected')}</p>:null}
    {error?<p role="alert" className="power-up-error">{error}</p>:null}
  </section>;
}
