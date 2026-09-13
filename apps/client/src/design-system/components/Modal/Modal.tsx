import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffectiveReducedMotion } from '../../../settings/selectors';
import './Modal.css';

interface ModalProps {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  closeOnEscape?: boolean;
  closeOnOutsideClick?: boolean;
  role?: 'dialog' | 'alertdialog';
  className?: string;
}

export default function Modal({
  open,
  title,
  children,
  onClose,
  closeOnEscape = true,
  closeOnOutsideClick = false,
  role = 'dialog',
  className = '',
}: ModalProps) {
  const reduced = useEffectiveReducedMotion();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTarget = dialogRef.current?.querySelector<HTMLElement>('[data-modal-autofocus]')
      ?? dialogRef.current?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    (focusTarget ?? dialogRef.current)?.focus();
    return () => {
      const focusToRestore = previousFocus.current;
      queueMicrotask(() => {
        if (document.querySelector('[aria-modal="true"]')) return;
        if (focusToRestore?.isConnected) focusToRestore.focus();
      });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape && onClose) {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ) ?? [])];
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeOnEscape, onClose, open]);

  if (!open || typeof document === 'undefined') return null;

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnOutsideClick && event.target === event.currentTarget) onClose?.();
  };

  return createPortal(
    <div className="ds-modal__overlay" onMouseDown={handleBackdropClick}>
      <motion.div
        ref={dialogRef}
        className={`ds-modal__card${className ? ` ${className}` : ''}`}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={reduced ? false : { opacity: 0, y: 12, scale: 0.96 }}
        animate={reduced ? {} : { opacity: 1, y: 0, scale: 1 }}
        transition={reduced ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
      >
        <header className="ds-modal__header">
          <h2 id={titleId} className="ds-modal__title">{title}</h2>
          {onClose
            ? (
              <button type="button" className="ds-modal__close" aria-label="Đóng" title="Đóng" onClick={onClose}>
                <X className="action-icon action-icon--only" aria-hidden="true" />
              </button>
            )
            : null}
        </header>
        <div className="ds-modal__body">{children}</div>
      </motion.div>
    </div>,
    document.body,
  );
}
