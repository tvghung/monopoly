import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import Button from '../Button/Button';
import Modal from '../Modal/Modal';
import { ActionIcon } from '../../icons/ActionIcon';
import './ConfirmationDialog.css';

interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmIcon?: ReactNode;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A blocking yes / no question. Cancel comes first and takes focus; the confirming action is the danger button.
 * It stacks over other dialogs (the Modal keeps a stack), so cancelling returns focus to the button that opened it.
 */
export default function ConfirmationDialog({
  open,
  title,
  message,
  confirmLabel,
  confirmIcon,
  cancelLabel = 'Hủy',
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      role="alertdialog"
      size="sm"
      tone="danger"
      layer="card"
      footer={(
        <div className="ds-confirmation__actions">
          <Button data-modal-autofocus variant="secondary" icon={<X />} onClick={onCancel}>{cancelLabel}</Button>
          <Button variant="danger" icon={confirmIcon} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      )}
    >
      <div className="ds-confirmation__body">
        <span className="ds-confirmation__icon" aria-hidden="true"><ActionIcon name="warning" size={28} /></span>
        <p className="ds-confirmation__message">{message}</p>
      </div>
    </Modal>
  );
}
