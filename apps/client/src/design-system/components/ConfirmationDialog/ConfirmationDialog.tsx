import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import Button from '../Button/Button';
import Modal from '../Modal/Modal';
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
    <Modal open={open} title={title} onClose={onCancel} role="alertdialog">
      <p className="ds-confirmation__message">{message}</p>
      <div className="ds-confirmation__actions">
        <Button data-modal-autofocus variant="secondary" icon={<X />} onClick={onCancel}>{cancelLabel}</Button>
        <Button variant="danger" icon={confirmIcon} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

