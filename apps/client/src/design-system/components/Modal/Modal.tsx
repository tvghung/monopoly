import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { useEffectiveReducedMotion } from '../../../settings/selectors';
import IconButton from '../IconButton/IconButton';
import { useTranslation } from '../../../i18n/I18n';
import { motionDuration, motionEase } from '../../motion/motionTokens';
import ModalPeekRestore from './ModalPeekRestore';
import { registerPeek, useOwnsRestoreKey } from './modalPeek';
import './Modal.css';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';
export type ModalPlacement = 'center' | 'sheet';
export type ModalBackdrop = 'dim' | 'clear';
export type ModalTone = 'default' | 'danger' | 'celebration';
export type ModalLayer = 'modal' | 'card';
/** `decision`: a pending decision of the game; `view`: any other dialog that may be set aside to look at the board. */
export type ModalPeek = 'decision' | 'view';

export interface ModalProps {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  closeOnEscape?: boolean;
  closeOnOutsideClick?: boolean;
  role?: 'dialog' | 'alertdialog';
  className?: string;
  /** Maximum width: 400 / 520 / 680 / 880 px. */
  size?: ModalSize;
  /** `sheet` docks the dialog above the bottom edge (a full-width bottom sheet on phones). */
  placement?: ModalPlacement;
  /** `clear` keeps the board visible but still blocks pointer input behind the dialog. */
  backdrop?: ModalBackdrop;
  /** Small label above the title. */
  eyebrow?: ReactNode;
  /** Sticky footer, for the actions of the dialog. */
  footer?: ReactNode;
  tone?: ModalTone;
  /** Z-index layer: `modal` (60) or `card` (70, above ordinary dialogs, below toasts and the connection overlay). */
  layer?: ModalLayer;
  /** Color of a band above the header, for example a deed's district color. */
  headerAccent?: string;
  /** Id of the element that describes the dialog (aria-describedby); alertdialogs should always have one. */
  describedBy?: string;
  /**
   * Adds the "view board" key (an eye) to the header. It only hides the dialog and its backdrop (the content stays mounted, so
   * choices, typed text, a pending request and an error line survive) and shows a floating "show decision" key; it sends nothing
   * and decides nothing. `decision` marks a pending decision of the game: while one is hidden, what a player opens from the board
   * is read-only (`useDecisionHidden`).
   */
  peek?: ModalPeek;
  /** A hidden dialog is shown again when this changes: a different decision has taken its place. */
  peekKey?: string | number;
  /** A compact status (for example the seconds left of a debt) drawn beside the floating "show decision" key. */
  peekSummary?: ReactNode;
}

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'ds-modal--sm', md: 'ds-modal--md', lg: 'ds-modal--lg', xl: 'ds-modal--xl',
};

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])';

interface ModalEntry {
  node: RefObject<HTMLElement | null>;
  /** The element that had focus when this dialog opened. */
  opener: HTMLElement | null;
  /** Hidden by the peek key: it no longer owns Escape, Tab or the focus return, and the dialog below it does. */
  peeking: boolean;
}

/**
 * Open dialogs, oldest first. The last one is the top dialog: only it handles Escape and Tab, and when a dialog closes
 * focus goes back to the element that opened it, or into the dialog below when that element lives there (a
 * confirmation opened from a button inside another dialog).
 */
const modalStack: ModalEntry[] = [];

/** The dialog that owns the keyboard: the top one that is not hidden by the peek key. */
function activeEntry(): ModalEntry | undefined {
  for (let index = modalStack.length - 1; index >= 0; index -= 1) {
    if (!modalStack[index].peeking) return modalStack[index];
  }
  return undefined;
}

function focusInto(container: HTMLElement | null): void {
  if (!container) return;
  (container.querySelector<HTMLElement>('[data-modal-autofocus]')
    ?? container.querySelector<HTMLElement>(FOCUSABLE)
    ?? container).focus();
}

function releaseModal(entry: ModalEntry): void {
  const index = modalStack.indexOf(entry);
  if (index === -1) return;
  modalStack.splice(index, 1);
  queueMicrotask(() => {
    const below = activeEntry()?.node.current ?? null;
    if (entry.opener?.isConnected && (!below || below.contains(entry.opener))) {
      entry.opener.focus();
    } else if (below?.isConnected) {
      focusInto(below);
    } else if (entry.opener?.isConnected) {
      entry.opener.focus();
    }
  });
}

function ModalSurface({
  title,
  children,
  onClose,
  closeOnEscape = true,
  closeOnOutsideClick = false,
  role = 'dialog',
  className = '',
  size = 'md',
  placement = 'center',
  backdrop = 'dim',
  eyebrow,
  footer,
  tone = 'default',
  layer = 'modal',
  headerAccent,
  describedBy,
  peek,
  peekKey,
  peekSummary,
}: Omit<ModalProps, 'open'>) {
  const { t } = useTranslation();
  const reduced = useEffectiveReducedMotion();
  const isPresent = useIsPresent();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const entryRef = useRef<ModalEntry | null>(null);
  // Captured on the first mount effect only: React StrictMode runs it twice in development, and the second run would
  // otherwise record the dialog's own button (focused by the first run) as the opener.
  const openerRef = useRef<HTMLElement | null | undefined>(undefined);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Peek: hiding is local, presentation-only state of this surface. The content below stays mounted while `peeking`.
  const [peeking, setPeeking] = useState(false);
  const [focusRestoreKey, setFocusRestoreKey] = useState(false);
  const [peekId] = useState(() => Symbol('modal-peek'));
  const peekKeyRef = useRef(peekKey);
  const ownsRestoreKey = useOwnsRestoreKey(peekId);
  const showDialog = useCallback(() => {
    setPeeking(false);
    setFocusRestoreKey(false);
  }, []);
  const hideDialog = useCallback(() => {
    setPeeking(true);
    setFocusRestoreKey(true);
  }, []);
  const consumeRestoreFocus = useCallback(() => setFocusRestoreKey(false), []);
  const wasPeeking = useRef(false);

  useEffect(() => {
    // A dialog that is animating out (its decision is over) no longer counts as hidden.
    if (!peeking || !peek || !isPresent) return undefined;
    return registerPeek(peekId, peek === 'decision');
  }, [isPresent, peekId, peeking, peek]);

  useEffect(() => {
    if (entryRef.current) entryRef.current.peeking = peeking;
    // Shown again by the player: the eye key they pressed is where the keyboard continues.
    if (wasPeeking.current && !peeking) dialogRef.current?.querySelector<HTMLElement>('[data-modal-peek]')?.focus();
    wasPeeking.current = peeking;
  }, [peeking]);

  // A different decision has replaced the one that was hidden: show it, and start in it as a freshly opened dialog does.
  useEffect(() => {
    if (peekKeyRef.current === peekKey) return;
    peekKeyRef.current = peekKey;
    if (!wasPeeking.current) return;
    showDialog();
    queueMicrotask(() => focusInto(dialogRef.current));
  }, [peekKey, showDialog]);

  useEffect(() => {
    if (openerRef.current === undefined) {
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement && !dialogRef.current?.contains(active) ? active : null;
    }
    const entry: ModalEntry = { node: dialogRef, opener: openerRef.current, peeking: false };
    entryRef.current = entry;
    modalStack.push(entry);
    focusInto(dialogRef.current);
    return () => releaseModal(entry);
  }, []);

  // A dialog that is animating out no longer owns focus, Escape or the modal semantics.
  useEffect(() => {
    if (!isPresent && entryRef.current) releaseModal(entryRef.current);
  }, [isPresent]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (activeEntry() !== entryRef.current) return;
      if (event.key === 'Escape' && closeOnEscape && closeRef.current) {
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      // Focus on something that is not in the tab ring (a tabindex="-1" start element, the card itself) must not let the
      // first Tab or Shift+Tab walk out of the dialog.
      const outsideRing = !(active instanceof HTMLElement) || !focusable.includes(active);
      if (event.shiftKey && (active === first || outsideRing)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outsideRing)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeOnEscape]);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnOutsideClick && event.target === event.currentTarget) onClose?.();
  };

  const sheet = placement === 'sheet';
  // Enter 280 ms (scale + fade, or a short rise for the sheet), exit 200 ms; reduced motion is a 120 ms fade.
  const cardMotion = reduced
    ? {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: motionDuration.micro } },
      exit: { opacity: 0, transition: { duration: motionDuration.micro } },
    }
    : {
      initial: sheet ? { opacity: 0, y: 24 } : { opacity: 0, scale: 0.96 },
      animate: { opacity: 1, y: 0, scale: 1, transition: { duration: motionDuration.panel, ease: motionEase.out } },
      exit: {
        opacity: 0,
        ...(sheet ? { y: 16 } : { scale: 0.97 }),
        transition: { duration: motionDuration.ui, ease: motionEase.out },
      },
    };
  const overlayMotion = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: reduced ? motionDuration.micro : motionDuration.ui } },
    exit: { opacity: 0, transition: { duration: reduced ? motionDuration.micro : motionDuration.ui } },
  };
  const cardStyle = headerAccent ? ({ '--ds-modal-accent': headerAccent } as CSSProperties) : undefined;

  return (
    <>
      <motion.div
        className={`ds-modal__overlay ds-modal__overlay--${placement} ds-modal__overlay--${backdrop} ds-modal__overlay--${layer}`}
        data-exiting={isPresent ? undefined : 'true'}
        data-peeking={peeking ? 'true' : undefined}
        // A hidden dialog takes no space, no pointer input and no part in the accessibility tree; its content stays mounted.
        hidden={peeking}
        onMouseDown={handleBackdropClick}
        {...overlayMotion}
      >
        <motion.div
          ref={dialogRef}
          className={[
            'ds-modal__card',
            SIZE_CLASS[size],
            `ds-modal--${placement}`,
            `ds-modal--${tone}`,
            className,
          ].filter(Boolean).join(' ')}
          style={cardStyle}
          role={role}
          aria-modal={isPresent ? 'true' : undefined}
          aria-hidden={isPresent ? undefined : true}
          inert={!isPresent}
          aria-labelledby={titleId}
          aria-describedby={describedBy}
          tabIndex={-1}
          {...cardMotion}
        >
          {headerAccent ? <span className="ds-modal__accent" aria-hidden="true" /> : null}
          <header className="ds-modal__header">
            <div className="ds-modal__heading">
              {eyebrow ? <p className="ds-modal__eyebrow">{eyebrow}</p> : null}
              <h2 id={titleId} className="ds-modal__title">{title}</h2>
            </div>
            {peek ? (
              <div className="ds-modal__tools">
                <IconButton className="ds-modal__peek" data-modal-peek label={t('modal.peek')} icon="view" onClick={hideDialog} />
                {onClose ? <IconButton className="ds-modal__close" label={t('ui.close')} icon="close" onClick={onClose} /> : null}
              </div>
            ) : onClose ? <IconButton className="ds-modal__close" label={t('ui.close')} icon="close" onClick={onClose} /> : null}
          </header>
          <div className="ds-modal__body">{children}</div>
          {footer ? <footer className="ds-modal__footer">{footer}</footer> : null}
        </motion.div>
      </motion.div>
      {peeking && isPresent && ownsRestoreKey ? (
        <ModalPeekRestore
          onRestore={showDialog}
          summary={peekSummary}
          focusOnShow={focusRestoreKey}
          onFocused={consumeRestoreFocus}
        />
      ) : null}
    </>
  );
}

export default function Modal({ open, ...surface }: ModalProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>{open ? <ModalSurface key="modal" {...surface} /> : null}</AnimatePresence>,
    document.body,
  );
}
