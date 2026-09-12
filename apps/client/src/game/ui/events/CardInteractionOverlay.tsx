import { useCallback, useContext, useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { allGameCards, gameCardsById, type GameCard } from '@monopoly/shared';
import stateContext from '../../../internal';
import { localizeAckError } from '../../../presentation';
import { usePresentation } from '../../presentation/PresentationProvider';
import { cardVisualFor, type CardVisualDefinition } from './cardVisuals';
import './CardInteractionOverlay.css';

interface CardPanelProps {
  card: GameCard;
  visual: CardVisualDefinition;
  dialog?: boolean;
  titleId?: string;
  descriptionId?: string;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  closeDisabled?: boolean;
  error?: string;
  onClose?: () => void;
}

function CardPanel({
  card,
  visual,
  dialog = false,
  titleId,
  descriptionId,
  closeButtonRef,
  closeDisabled = false,
  error = '',
  onClose,
}: CardPanelProps) {
  const content = (
    <>
      <span className={`card-modal__badge card-modal__badge--${visual.deck}`}>
        {visual.deck === 'chance' ? 'CƠ HỘI' : 'KHÍ VẬN'}
      </span>
      <img className="card-modal__art" src={visual.artworkUrl} alt={`${visual.title} — minh họa`} />
      <div className="card-modal__copy">
        <h2 id={titleId}>{visual.title}</h2>
        <p id={descriptionId}>{card.message}</p>
      </div>
      {onClose
        ? (
          <button
            ref={closeButtonRef}
            className="card-modal__close"
            type="button"
            disabled={closeDisabled}
            onClick={onClose}
          >
            Đóng
          </button>
        )
        : null}
      {error ? <p className="card-modal__error" role="alert">{error}</p> : null}
    </>
  );

  return dialog
    ? <section className="card-modal__panel">{content}</section>
    : <article className="card-gallery__card">{content}</article>;
}

export function CardArtworkGallery() {
  return (
    <main className="card-art-gallery">
      <header className="card-art-gallery__header">
        <p className="eyebrow">Own the Block · DEV ONLY</p>
        <h1>Card artwork gallery</h1>
        <p>28 authoritative cards, using the live titles and messages.</p>
      </header>
      <div className="card-art-gallery__grid">
        {allGameCards.map(card => {
          const visual = cardVisualFor(card.id);
          if (!visual) return null;
          return <CardPanel key={card.id} card={card} visual={visual} />;
        })}
      </div>
    </main>
  );
}

const safeDomId = (operationId: string): string => operationId.replace(/[^a-zA-Z0-9_-]/g, '-');

export default function CardInteractionOverlay() {
  const { state, playerId, role, canMutate, connected, socketFunctions } = useContext(stateContext);
  const { state: presentation } = usePresentation();
  const pendingCard = state.turnInfo.pendingCardInteraction;
  const cardPresentation = pendingCard
    && presentation.cardPresentation?.operationId === pendingCard.operationId
    ? presentation.cardPresentation
    : null;
  const cardId = pendingCard?.revealedCardId;
  const pendingOperationId = pendingCard?.operationId;
  const card = cardId ? gameCardsById[cardId] : undefined;
  const visual = cardId ? cardVisualFor(cardId) : undefined;
  const revealed = Boolean(
    pendingCard?.stage === 'REVEALED'
    && cardId
    && cardPresentation?.stage === 'REVEALED'
    && cardPresentation.revealedCardId === cardId
    && card
    && visual,
  );
  const actor = Boolean(
    pendingCard
    && pendingCard.playerId === playerId
    && role === 'PLAYER'
    && canMutate
    && connected,
  );
  const [dismissPending, setDismissPending] = useState(false);
  const [dismissError, setDismissError] = useState('');
  const dismissPendingRef = useRef(false);
  const observedOperationRef = useRef<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const operationId = pendingCard?.operationId ?? null;
    if (!operationId || pendingCard?.stage !== 'REVEALED') {
      observedOperationRef.current = null;
      dismissPendingRef.current = false;
      setDismissPending(false);
      setDismissError('');
      return;
    }
    if (observedOperationRef.current !== operationId) {
      observedOperationRef.current = operationId;
      dismissPendingRef.current = false;
      setDismissPending(false);
      setDismissError('');
    }
  }, [pendingCard?.operationId, pendingCard?.stage]);

  useEffect(() => {
    if (!revealed || !pendingOperationId) return;
    const target = actor ? closeButtonRef.current : dialogRef.current;
    target?.focus();
  }, [actor, pendingOperationId, revealed]);

  const dismiss = useCallback(async () => {
    if (!revealed || !actor || !pendingCard || dismissPendingRef.current) return;
    const dismissCard = socketFunctions.dismissCard;
    if (!dismissCard) {
      setDismissError('Chưa thể đóng thẻ trong phiên này.');
      return;
    }
    dismissPendingRef.current = true;
    setDismissPending(true);
    setDismissError('');
    try {
      const response = await dismissCard(pendingCard.operationId);
      if (!response || response.ok) return;
      dismissPendingRef.current = false;
      setDismissPending(false);
      setDismissError(localizeAckError(response.error));
    } catch {
      dismissPendingRef.current = false;
      setDismissPending(false);
      setDismissError('Không thể gửi lệnh đóng thẻ.');
    }
  }, [actor, pendingCard, revealed, socketFunctions.dismissCard]);

  if (!revealed || !pendingCard || !card || !visual || typeof document === 'undefined') return null;

  const ids = safeDomId(pendingCard.operationId);
  const titleId = `card-dialog-title-${ids}`;
  const descriptionId = `card-dialog-description-${ids}`;
  const closeDisabled = !actor || dismissPending;

  return createPortal(
    <div className="card-modal" data-testid="card-interaction-overlay" data-card-stage="REVEALED">
      <div className="card-modal__scrim" aria-hidden="true" />
      <section
        ref={dialogRef}
        className="card-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <CardPanel
          card={card}
          visual={visual}
          dialog
          titleId={titleId}
          descriptionId={descriptionId}
          closeButtonRef={closeButtonRef}
          closeDisabled={closeDisabled}
          onClose={() => void dismiss()}
          error={dismissError}
        />
        {!actor ? <p className="card-modal__helper">Đang chờ người chơi đóng thẻ</p> : null}
      </section>
    </div>,
    document.body,
  );
}
