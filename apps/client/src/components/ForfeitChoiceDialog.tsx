import { useId } from 'react';
import Button from '../design-system/components/Button/Button';
import Modal from '../design-system/components/Modal/Modal';
import { ActionIcon } from '../design-system/icons/ActionIcon';
import './ForfeitChoiceDialog.css';

interface ForfeitChoiceDialogProps {
  open: boolean;
  /** This machine hosts the room: the LAN game keeps running for everybody else after the player leaves. */
  hosting?: boolean;
  /** "Rời phòng" is in flight. */
  leaving?: boolean;
  /** Stay in the room as a spectator. Also what Escape does. */
  onWatch: () => void;
  onLeave: () => void;
}

/**
 * What a player sees right after "Bỏ cuộc": the game goes on without them, and they choose between watching it and leaving.
 * Watching is the default (autofocus, Escape), because leaving cannot be undone and the player was not asked to leave.
 */
export default function ForfeitChoiceDialog({
  open, hosting = false, leaving = false, onWatch, onLeave,
}: ForfeitChoiceDialogProps) {
  const messageId = useId();
  return (
    <Modal
      open={open}
      title="Bạn đã bỏ cuộc"
      onClose={onWatch}
      role="alertdialog"
      size="sm"
      describedBy={messageId}
      footer={(
        <div className="forfeit-choice__actions">
          <Button
            variant="secondary"
            icon={<ActionIcon name="leave" />}
            busy={leaving}
            onClick={onLeave}
          >Rời phòng</Button>
          <Button data-modal-autofocus icon={<ActionIcon name="view" />} onClick={onWatch}>Xem tiếp</Button>
        </div>
      )}
    >
      <div className="forfeit-choice__body">
        <span className="forfeit-choice__icon" aria-hidden="true"><ActionIcon name="forfeit" size={28} /></span>
        <div className="forfeit-choice__text">
          <p id={messageId} className="forfeit-choice__message">
            Tài sản của bạn đã trả về ngân hàng. Bạn có thể ở lại xem các bạn chơi tiếp hoặc rời phòng.
          </p>
          {hosting
            ? <p className="forfeit-choice__hint">Máy này vẫn đang giữ phòng cho mọi người.</p>
            : null}
        </div>
      </div>
    </Modal>
  );
}
