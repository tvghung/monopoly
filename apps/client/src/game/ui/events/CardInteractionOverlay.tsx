import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { allGameCards, CARD_MINIMUM_VISIBLE_MS, gameCardsById, type CardDeck, type GameCard } from '@monopoly/shared';
import stateContext from '../../../internal';
import Button from '../../../design-system/components/Button/Button';
import Modal from '../../../design-system/components/Modal/Modal';
import { usePresentationSelector } from '../../presentation/usePresentationSelector';
import { selectCardPresentation, selectPresentationResetEpoch } from '../../presentation/store/selectors';
import { cardVisualFor, type CardVisualDefinition } from './cardVisuals';
import './CardInteractionOverlay.css';
import { translate, useTranslation } from '../../../i18n/I18n';
import { getCardPresentation } from '../../../i18n/cardCopy';
import { useLocalizedError } from '../../../i18n/useLocalizedError';

/** The gold medallion of a deck: a question mark for Cơ Hội, a treasure chest for Khí Vận. Drawn here, no art file. */
function DeckEmblem({ deck }: { deck: CardDeck }) {
  return (
    <svg className="card-face__emblem" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle className="card-face__emblem-disc" cx="12" cy="12" r="11" />
      {deck === 'chance'
        ? (
          <>
            <path className="card-face__emblem-line" d="M8.9 9.4a3.2 3.2 0 1 1 4.9 2.7c-1 .6-1.7 1.3-1.7 2.5" />
            <circle className="card-face__emblem-ink" cx="12.1" cy="17.6" r="1.4" />
          </>
        )
        : (
          <>
            <path className="card-face__emblem-ink" d="M5.6 11.2a6.4 4.6 0 0 1 12.8 0z" />
            <rect className="card-face__emblem-ink" x="5.6" y="11.8" width="12.8" height="6" rx="1.2" />
            <rect className="card-face__emblem-disc" x="10.6" y="10.2" width="2.8" height="3.6" rx="0.7" />
          </>
        )}
    </svg>
  );
}

function DeckBadge({ deck, language = 'vi' }: { deck: CardDeck; language?: 'vi' | 'en' }) {
  const key = deck === 'chance' ? 'card.deckChance' : 'card.deckChest';
  return (
    <span className="card-face__badge">
      <DeckEmblem deck={deck} />
      {translate(key, language)}
    </span>
  );
}

function CardArtwork({ visual, language = 'vi' }: { visual: CardVisualDefinition; language?: 'vi' | 'en' }) {
  return (
    <img
      className="card-face__art"
      src={visual.artworkUrl}
      width={640}
      height={400}
      alt={translate('card.artAlt', language, { title: visual.title })}
    />
  );
}

function CardGalleryItem({ card, visual }: { card: GameCard; visual: CardVisualDefinition }) {
  return (
    <article className={`card-face card-face--${visual.deck} card-face--gallery`}>
      <header className="card-face__header">
        <DeckBadge deck={visual.deck} />
        <h2 className="card-face__title">{visual.title}</h2>
      </header>
      <CardArtwork visual={visual} />
      <p className="card-face__message">{card.message}</p>
    </article>
  );
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
          return <CardGalleryItem key={card.id} card={card} visual={visual} />;
        })}
      </div>
    </main>
  );
}

const safeDomId = (operationId: string): string => operationId.replace(/[^a-zA-Z0-9_-]/g, '-');

/**
 * The revealed Chance / Khí Vận card (plan 04 §8.5), a printed card on the table. It is a card-layer Modal with no close
 * control, Escape or backdrop dismissal: only the acting player's "Đóng" ends it, and it waits for that indefinitely.
 */
export default function CardInteractionOverlay() {
  const { language, t } = useTranslation();
  const { state, playerId, role, canMutate, connected, socketFunctions } = useContext(stateContext);
  const cardPresentation = usePresentationSelector(selectCardPresentation);
  const presentationResetEpoch = usePresentationSelector(selectPresentationResetEpoch);
  const pendingCard = state.turnInfo.pendingCardInteraction;
  const [retainedCardPresentation, setRetainedCardPresentation] = useState(
    cardPresentation?.stage === 'REVEALED' ? cardPresentation : null,
  );
  const resetEpochRef = useRef(presentationResetEpoch);
  const [readTime, setReadTime] = useState<{ operationId: string | null; remainingMs: number }>({
    operationId: null,
    remainingMs: CARD_MINIMUM_VISIBLE_MS,
  });
  const readingVisibleRef = useRef(false);
  const lastReadTickRef = useRef(0);
  const onCardVisibleChange = useCallback((visible: boolean) => {
    readingVisibleRef.current = visible;
    lastReadTickRef.current = performance.now();
  }, []);
  const retainedRemainingMs = readTime.operationId === retainedCardPresentation?.operationId
    ? readTime.remainingMs
    : CARD_MINIMUM_VISIBLE_MS;
  useEffect(() => {
    if (resetEpochRef.current !== presentationResetEpoch) {
      resetEpochRef.current = presentationResetEpoch;
      setRetainedCardPresentation(cardPresentation?.stage === 'REVEALED' ? cardPresentation : null);
      return;
    }
    if (cardPresentation?.stage === 'REVEALED'
      && (!retainedCardPresentation || retainedRemainingMs === 0)) {
      setRetainedCardPresentation(cardPresentation);
    }
  }, [cardPresentation, presentationResetEpoch, retainedCardPresentation, retainedRemainingMs]);
  // An observer finishes reading the current card before a later operation replaces it.
  const retainUnreadCard = Boolean(retainedCardPresentation && retainedRemainingMs > 0
    && cardPresentation?.operationId !== retainedCardPresentation.operationId);
  const visibleCardPresentation = retainUnreadCard ? retainedCardPresentation
    : cardPresentation?.stage === 'REVEALED' ? cardPresentation : null;
  const cardId = visibleCardPresentation?.stage === 'REVEALED' ? visibleCardPresentation.revealedCardId : undefined;
  const pendingOperationId = visibleCardPresentation?.operationId;
  const cardReadOperationId = pendingOperationId ?? null;
  const remainingMs = readTime.operationId === cardReadOperationId ? readTime.remainingMs : CARD_MINIMUM_VISIBLE_MS;
  const card = cardId ? gameCardsById[cardId] : undefined;
  const localizedCard = cardId ? getCardPresentation(cardId, language) : undefined;
  const visual = cardId ? cardVisualFor(cardId, language) : undefined;
  const revealed = Boolean(
    visibleCardPresentation?.stage === 'REVEALED'
    && cardId
    && visibleCardPresentation.revealedCardId === cardId
    && card
    && visual,
  );
  const localActor = Boolean(
    visibleCardPresentation
    && visibleCardPresentation.playerId === playerId
    && role === 'PLAYER'
    && canMutate
  );
  const actor = Boolean(
    localActor
    && pendingCard?.operationId === visibleCardPresentation?.operationId
    && pendingCard?.stage === 'REVEALED'
    && connected,
  );
  const [dismissPending, setDismissPending] = useState(false);
  const { error: dismissError, clearError, setErrorKey, setAckError } = useLocalizedError();
  const dismissPendingRef = useRef(false);
  const restoreFocusRef = useRef(false);
  const observedOperationRef = useRef<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const descriptionId = pendingOperationId ? `card-dialog-description-${safeDomId(pendingOperationId)}` : undefined;
  const peekKey = pendingCard?.operationId === pendingOperationId ? pendingOperationId : undefined;

  useEffect(() => {
    if (!cardReadOperationId) {
      setReadTime({ operationId: null, remainingMs: CARD_MINIMUM_VISIBLE_MS });
      return undefined;
    }
    let remainingMs = CARD_MINIMUM_VISIBLE_MS;
    lastReadTickRef.current = performance.now();
    setReadTime({ operationId: cardReadOperationId, remainingMs });
    const tick = () => {
      const now = performance.now();
      if (document.visibilityState === 'visible' && readingVisibleRef.current) {
        remainingMs = Math.max(0, remainingMs - (now - lastReadTickRef.current));
      }
      lastReadTickRef.current = now;
      setReadTime({ operationId: cardReadOperationId, remainingMs });
    };
    const onVisibilityChange = () => { lastReadTickRef.current = performance.now(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    const interval = window.setInterval(tick, 100);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [cardReadOperationId]);

  const canDismiss = actor && remainingMs <= 0;

  useEffect(() => {
    if (retainedRemainingMs === 0
      && retainedCardPresentation
      && pendingCard?.operationId !== retainedCardPresentation.operationId
      && cardPresentation?.stage !== 'REVEALED') {
      setRetainedCardPresentation(null);
    }
  }, [cardPresentation?.stage, pendingCard?.operationId, retainedRemainingMs, retainedCardPresentation]);

  useEffect(() => {
    const operationId = pendingCard?.operationId ?? null;
    if (!operationId || pendingCard?.stage !== 'REVEALED') {
      observedOperationRef.current = null;
      dismissPendingRef.current = false;
      setDismissPending(false);
      clearError();
      return;
    }
    if (observedOperationRef.current !== operationId) {
      observedOperationRef.current = operationId;
      dismissPendingRef.current = false;
      setDismissPending(false);
      clearError();
    }
  }, [clearError, pendingCard?.operationId, pendingCard?.stage]);

  // A button that turns disabled while its request is in flight drops keyboard focus to the page. After a failed request it is
  // enabled again: put the focus back on it, or Enter and Space would do nothing and Tab would leave the dialog.
  useEffect(() => {
    if (dismissPending || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    stageRef.current?.querySelector<HTMLElement>('[data-modal-autofocus]')?.focus();
  }, [dismissPending]);

  useEffect(() => {
    if (!revealed || !pendingOperationId) return;
    const stage = stageRef.current;
    const target = canDismiss
      ? stage?.querySelector<HTMLElement>('[data-modal-autofocus]')
      : stage?.closest<HTMLElement>('[role="dialog"]');
    target?.focus();
  }, [canDismiss, pendingOperationId, revealed]);

  const dismiss = useCallback(async () => {
    if (!revealed || !actor || remainingMs > 0 || !pendingCard || dismissPendingRef.current) return;
    const dismissCard = socketFunctions.dismissCard;
    if (!dismissCard) {
      setErrorKey('card.dismissUnavailable');
      return;
    }
    dismissPendingRef.current = true;
    setDismissPending(true);
    clearError();
    try {
      const response = await dismissCard(pendingCard.operationId);
      if (!response || response.ok) return;
      dismissPendingRef.current = false;
      restoreFocusRef.current = true;
      setDismissPending(false);
      setAckError(response.error);
    } catch {
      dismissPendingRef.current = false;
      restoreFocusRef.current = true;
      setDismissPending(false);
      setErrorKey('card.dismissFailed');
    }
  }, [actor, clearError, pendingCard, remainingMs, revealed, setAckError, setErrorKey, socketFunctions.dismissCard]);

  const shown = revealed && card && visual ? { card, visual } : null;
  const deck = shown?.visual.deck ?? 'chance';

  return (
    <Modal
      open={shown !== null}
      onVisibleChange={onCardVisibleChange}
      title={shown?.visual.title ?? ''}
      eyebrow={shown ? <DeckBadge deck={deck} language={language} /> : null}
      size="sm"
      layer="card"
      peek={actor ? 'decision' : 'view'}
      peekKey={peekKey}
      describedBy={shown ? descriptionId : undefined}
      closeOnEscape={false}
      closeOnOutsideClick={false}
      className={`card-modal card-face card-face--${deck}`}
    >
      {shown
        ? (
          <div
            ref={stageRef}
            className="card-modal__stage"
            data-testid="card-interaction-overlay"
            data-card-stage="REVEALED"
          >
            <CardArtwork visual={shown.visual} language={language} />
            <p id={descriptionId} className="card-face__message">{localizedCard?.message}</p>
            <div className="card-modal__actions">
              {dismissError ? <p className="card-modal__error" role="alert">{dismissError}</p> : null}
              {!localActor || !connected ? <p className="card-modal__helper">{t('card.waitingForPlayer')}</p> : null}
              <Button
                data-modal-autofocus={canDismiss ? true : undefined}
                size="lg"
                busy={dismissPending}
                disabled={!canDismiss}
                onClick={() => void dismiss()}
              >
                {remainingMs > 0 ? t('card.closeCountdown', { seconds: Math.ceil(remainingMs / 1000) }) : t('card.close')}
              </Button>
            </div>
          </div>
        )
        : null}
    </Modal>
  );
}
