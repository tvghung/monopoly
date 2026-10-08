import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Eye } from 'lucide-react';
import { useTranslation } from '../../../i18n/I18n';

interface ModalPeekRestoreProps {
  onRestore: () => void;
  /** A compact status of the hidden decision, for example the seconds left of a debt. */
  summary?: ReactNode;
  /** Take focus when drawn: the player has just hidden the dialog, so the key is where the keyboard goes next. */
  focusOnShow: boolean;
  onFocused: () => void;
}

/**
 * The floating "Hiện quyết định" / "Show Decision" key of a hidden dialog, fixed at the top center of the window (below the notch).
 * Only its own box takes pointer input; the row around it is click-through, so nothing else of the board is covered. It sits under
 * the dialog layers (`--z-floating-control`), so a dialog opened over the board (a property card) covers it until it is closed.
 */
export default function ModalPeekRestore({
  onRestore, summary, focusOnShow, onFocused,
}: ModalPeekRestoreProps) {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusedRef = useRef(onFocused);
  useEffect(() => {
    focusedRef.current = onFocused;
  }, [onFocused]);

  useEffect(() => {
    if (!focusOnShow) return;
    buttonRef.current?.focus();
    focusedRef.current();
  }, [focusOnShow]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="ds-modal-peek" data-testid="modal-peek-restore">
      <button
        ref={buttonRef}
        type="button"
        className="ds-button ds-button--primary ds-button--md ds-modal-peek__button"
        onClick={onRestore}
      >
        <span className="ds-button__icon" aria-hidden="true"><Eye /></span>
        {t('modal.peekRestore')}
      </button>
      {summary ? <span className="ds-modal-peek__summary">{summary}</span> : null}
    </div>,
    document.body,
  );
}
