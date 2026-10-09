import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../../../i18n/I18n';
import IconButton from '../IconButton/IconButton';

/** Where the dialog's hide key was on screen when it was pressed (viewport pixels). */
export interface PeekAnchor {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ModalPeekRestoreProps {
  onRestore: () => void;
  /** The hide key's place: the restore key takes exactly that place, so the toggle never moves under the finger. */
  anchor: PeekAnchor | null;
  /** A compact status of the hidden decision, for example the seconds left of a debt. */
  summary?: ReactNode;
  /** Take focus when drawn: the player has just hidden the dialog, so the key is where the keyboard goes next. */
  focusOnShow: boolean;
  onFocused: () => void;
}

/** The touch target is never smaller than 44 px, centred on the hide key. */
const MIN_TARGET = 44;

function placement(anchor: PeekAnchor | null): CSSProperties | undefined {
  if (!anchor || anchor.width <= 0 || anchor.height <= 0 || typeof window === 'undefined') return undefined;
  const size = Math.max(MIN_TARGET, anchor.width, anchor.height);
  const centerX = anchor.left + anchor.width / 2;
  const centerY = anchor.top + anchor.height / 2;
  // Kept inside the window if it was resized while the dialog was hidden.
  const left = Math.min(Math.max(0, centerX - size / 2), Math.max(0, window.innerWidth - size));
  const top = Math.min(Math.max(0, centerY - size / 2), Math.max(0, window.innerHeight - size));
  return { top, left, width: size, height: size };
}

/**
 * The restore key of a hidden dialog: an icon-only eye, drawn in its own layer (portal on `body`, so no opacity or transform of
 * the hidden dialog can affect it) exactly where the dialog's eye-off key was. Only the key (and the optional status beside it)
 * takes pointer input; the hidden dialog itself is `display: none`. Without a measured place it falls back to the top center.
 * It sits under the dialog layers (`--z-floating-control`), so a dialog opened over the board covers it until it is closed.
 */
export default function ModalPeekRestore({
  onRestore, anchor, summary, focusOnShow, onFocused,
}: ModalPeekRestoreProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(onFocused);
  const [, setViewport] = useState(0);
  useEffect(() => {
    focusedRef.current = onFocused;
  }, [onFocused]);

  useEffect(() => {
    if (!focusOnShow) return;
    rootRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    focusedRef.current();
  }, [focusOnShow]);

  useEffect(() => {
    const resized = () => setViewport(value => value + 1);
    window.addEventListener('resize', resized);
    return () => window.removeEventListener('resize', resized);
  }, []);

  if (typeof document === 'undefined') return null;
  const style = placement(anchor);
  return createPortal(
    <div
      ref={rootRef}
      className={`ds-modal-peek${style ? ' ds-modal-peek--anchored' : ''}`}
      style={style}
      data-testid="modal-peek-restore"
    >
      <IconButton
        className="ds-modal-peek__button"
        data-modal-restore
        label={t('modal.peekRestore')}
        icon="showDialog"
        onClick={onRestore}
      />
      {summary ? <span className="ds-modal-peek__summary">{summary}</span> : null}
    </div>,
    document.body,
  );
}
