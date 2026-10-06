import { useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import Button from '../Button/Button';
import Modal from '../Modal/Modal';
import { ActionIcon } from '../../icons/ActionIcon';
import type { ActionIconName } from '../../icons/actionIcons';
import './ConfirmationDialog.css';

interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmIcon?: ReactNode;
  cancelLabel?: string;
  /** The glyph of the cancel button; the X unless given. */
  cancelIcon?: ReactNode;
  /** `danger` (the default) asks about something that cannot be undone; `neutral` is an ordinary request to answer. */
  tone?: 'danger' | 'neutral';
  /** The glyph beside the message; the warning triangle unless given. */
  icon?: ActionIconName;
  /** An answer is already on its way: both buttons are off so it cannot be given twice. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A blocking yes / no question. Cancel comes first and takes focus; the confirming action is the danger button (the primary one
 * for a `neutral` question). It stacks over other dialogs (the Modal keeps a stack), so cancelling returns focus to the button
 * that opened it.
 */
export default function ConfirmationDialog({
  open,
  title,
  message,
  confirmLabel,
  confirmIcon,
  cancelLabel = 'Hủy',
  cancelIcon = <X />,
  tone = 'danger',
  icon = 'warning',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const messageId = useId();
  const danger = tone === 'danger';
  return (
    <Modal
      open={open}
      title={title}
      // Escape and the header close key answer "no" too, so they go away with the buttons while an answer is on its way.
      onClose={busy ? undefined : onCancel}
      role="alertdialog"
      size="sm"
      tone={danger ? 'danger' : 'default'}
      layer="card"
      describedBy={messageId}
      footer={(
        <div className="ds-confirmation__actions">
          {/* While an answer is on its way both buttons are off: the dialog then has no autofocus target and the Modal focuses itself. */}
          <Button
            data-modal-autofocus={busy ? undefined : true}
            variant="secondary"
            icon={cancelIcon}
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} icon={confirmIcon} disabled={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      )}
    >
      <div className="ds-confirmation__body">
        <span className={`ds-confirmation__icon${danger ? '' : ' ds-confirmation__icon--neutral'}`} aria-hidden="true">
          <ActionIcon name={icon} size={28} />
        </span>
        <p id={messageId} className="ds-confirmation__message">{message}</p>
      </div>
    </Modal>
  );
}
