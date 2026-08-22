import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { gameCardsById } from '@monopoly/shared';
import stateContext from '../../../internal';
import { localizeAckError } from '../../../presentation';
import { usePresentation } from '../../presentation/PresentationProvider';
import { presentationTiming } from '../../presentation/timings';
import './CardInteractionOverlay.css';

interface CardInteractionContextValue {
  cardInteraction: {
    canDraw: boolean;
    drawPending: boolean;
    drawError: string;
    onDraw: (operationId: string) => void;
  };
}

const cardInteractionContext = createContext<CardInteractionContextValue | null>(null);

export function CardInteractionProvider({ children }: { children: ReactNode }) {
  const { state, playerId, role, canMutate, connected, socketFunctions } = useContext(stateContext);
  const { state: presentation } = usePresentation();
  const [drawPendingOperation, setDrawPendingOperation] = useState<string | null>(null);
  const [drawError, setDrawError] = useState('');
  const drawPendingRef = useRef<string | null>(null);
  const pendingCard = state.turnInfo.pendingCardInteraction;
  const queuedCard = pendingCard && presentation.cardPresentation?.operationId === pendingCard.operationId
    ? presentation.cardPresentation
    : null;
  const canDraw = Boolean(
    pendingCard
    && queuedCard?.stage === 'AWAITING_DRAW'
    && pendingCard.stage === 'AWAITING_DRAW'
    && pendingCard.playerId === playerId
    && role === 'PLAYER'
    && canMutate
    && connected
    && socketFunctions.drawCard,
  );

  useEffect(() => {
    const operationStillAwaiting = pendingCard?.stage === 'AWAITING_DRAW'
      && pendingCard.operationId === drawPendingRef.current;
    if (operationStillAwaiting && connected) return;
    drawPendingRef.current = null;
    setDrawPendingOperation(null);
    setDrawError('');
  }, [connected, pendingCard?.operationId, pendingCard?.stage, presentation.presentationResetEpoch]);

  const requestDraw = useCallback((operationId: string) => {
    if (!canDraw || pendingCard?.operationId !== operationId || drawPendingRef.current) return;
    drawPendingRef.current = operationId;
    setDrawPendingOperation(operationId);
    setDrawError('');
    void Promise.resolve(socketFunctions.drawCard?.(operationId))
      .then(response => {
        if (!response || response.ok) return;
        drawPendingRef.current = null;
        setDrawPendingOperation(null);
        setDrawError(localizeAckError(response.error));
      })
      .catch(() => {
        drawPendingRef.current = null;
        setDrawPendingOperation(null);
        setDrawError('Không thể gửi lệnh rút thẻ.');
      });
  }, [canDraw, pendingCard?.operationId, socketFunctions]);

  const value = useMemo(() => ({
    cardInteraction: {
      canDraw,
      drawPending: drawPendingOperation === pendingCard?.operationId,
      drawError,
      onDraw: requestDraw,
    },
  }), [canDraw, drawError, drawPendingOperation, pendingCard?.operationId, requestDraw]);

  return <cardInteractionContext.Provider value={value}>{children}</cardInteractionContext.Provider>;
}

export function useCardInteraction(): CardInteractionContextValue {
  const value = useContext(cardInteractionContext);
  if (!value) {
    return {
      cardInteraction: { canDraw: false, drawPending: false, drawError: '', onDraw: () => undefined },
    };
  }
  return value;
}

export default function CardInteractionOverlay() {
  const { state, playerId, role, canMutate, socketFunctions } = useContext(stateContext);
  const { state: presentation } = usePresentation();
  const { cardInteraction } = useCardInteraction();
  const pendingCard = state.turnInfo.pendingCardInteraction;
  const cardPresentation = pendingCard
    && presentation.cardPresentation?.operationId === pendingCard.operationId
    ? presentation.cardPresentation
    : null;
  const activeCard = Boolean(
    pendingCard
    && pendingCard.playerId === playerId
    && role === 'PLAYER'
    && canMutate,
  );
  const [revealUnlocked, setRevealUnlocked] = useState(false);
  const [dismissError, setDismissError] = useState('');
  const dismissButtonRef = useRef<HTMLButtonElement>(null);
  const revealActive = pendingCard?.stage === 'REVEALED'
    && cardPresentation?.stage === 'REVEALED';
  const card = pendingCard?.revealedCardId ? gameCardsById[pendingCard.revealedCardId] : undefined;

  useEffect(() => {
    setDismissError('');
    if (!revealActive) {
      setRevealUnlocked(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setRevealUnlocked(true), presentationTiming.cardRevealLock);
    return () => window.clearTimeout(timer);
  }, [revealActive, pendingCard?.operationId]);

  const dismiss = useCallback(async () => {
    if (!pendingCard || !activeCard || !revealActive || !revealUnlocked) return;
    const response = await socketFunctions.dismissCard?.(pendingCard.operationId);
    if (response && !response.ok) setDismissError(response.error.message);
  }, [activeCard, pendingCard, revealActive, revealUnlocked, socketFunctions]);

  useEffect(() => {
    if (!revealActive || !activeCard) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (revealUnlocked) void dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeCard, dismiss, revealActive, revealUnlocked]);

  useEffect(() => {
    if (revealUnlocked && activeCard) dismissButtonRef.current?.focus();
  }, [activeCard, revealUnlocked]);

  if (!pendingCard || !cardPresentation) return null;
  if (typeof document === 'undefined') return null;

  const awaiting = pendingCard.stage === 'AWAITING_DRAW'
    && cardPresentation.stage === 'AWAITING_DRAW';
  const revealed = pendingCard.stage === 'REVEALED';
  const statusCopy = awaiting
    ? activeCard ? 'Nhấn vào thẻ để xem' : 'Đang chờ người chơi rút thẻ'
    : cardPresentation.stage === 'DRAWING'
      ? 'Đang đưa thẻ lên…'
      : null;

  return createPortal(
    <div
      className={`card-focus-overlay card-focus-overlay--${pendingCard.stage.toLowerCase()}`}
      data-testid="card-focus-overlay"
      data-card-stage={pendingCard.stage}
      aria-live="polite"
    >
      <div
        className="card-focus-overlay__panel card-focus-overlay__panel--top"
        aria-hidden="true"
        onPointerDown={revealed && revealUnlocked ? () => void dismiss() : undefined}
      />
      <div
        className="card-focus-overlay__panel card-focus-overlay__panel--left"
        aria-hidden="true"
        onPointerDown={revealed && revealUnlocked ? () => void dismiss() : undefined}
      />
      <div
        className="card-focus-overlay__panel card-focus-overlay__panel--right"
        aria-hidden="true"
        onPointerDown={revealed && revealUnlocked ? () => void dismiss() : undefined}
      />
      <div
        className="card-focus-overlay__panel card-focus-overlay__panel--bottom"
        aria-hidden="true"
        onPointerDown={revealed && revealUnlocked ? () => void dismiss() : undefined}
      />
      {statusCopy ? <p className="card-focus-overlay__instruction">{statusCopy}</p> : null}
      <div className="sr-only" role="status">
        {awaiting ? statusCopy : revealed ? card?.message : 'Đang đưa thẻ lên'}
        {cardInteraction.drawError || dismissError ? ` ${cardInteraction.drawError || dismissError}` : ''}
      </div>
      {activeCard && awaiting
        ? (
          <button
            className="sr-only"
            type="button"
            disabled={!cardInteraction.canDraw || cardInteraction.drawPending}
            onClick={() => pendingCard && cardInteraction.onDraw(pendingCard.operationId)}
          >Nhấn vào thẻ để xem</button>
        )
        : null}
      {activeCard && revealed
        ? (
          <button
            ref={dismissButtonRef}
            className="sr-only"
            type="button"
            disabled={!revealUnlocked}
            onClick={() => void dismiss()}
          >Đóng thẻ</button>
        )
        : null}
    </div>,
    document.body,
  );
}
