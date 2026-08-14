import Button from '../Button/Button';
import Modal from '../Modal/Modal';
import './ConfirmationDialog.css';

interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmationDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Hủy',
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  return (
    <Modal open={open} title={title} onClose={onCancel} role="alertdialog">
      <p className="ds-confirmation__message">{message}</p>
      <div className="ds-confirmation__actions">
        <Button data-modal-autofocus variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
        <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

