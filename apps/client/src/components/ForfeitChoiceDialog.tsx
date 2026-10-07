import { useId } from 'react';
import Button from '../design-system/components/Button/Button';
import Modal from '../design-system/components/Modal/Modal';
import { ActionIcon } from '../design-system/icons/ActionIcon';
import './ForfeitChoiceDialog.css';
import { useTranslation } from '../i18n/I18n';

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
  const { t } = useTranslation();
  const messageId = useId();
  return (
    <Modal
      open={open}
      title={t('forfeit.title')}
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
          >{t('forfeit.leave')}</Button>
          <Button data-modal-autofocus icon={<ActionIcon name="view" />} onClick={onWatch}>{t('forfeit.watch')}</Button>
        </div>
      )}
    >
      <div className="forfeit-choice__body">
        <span className="forfeit-choice__icon" aria-hidden="true"><ActionIcon name="forfeit" size={28} /></span>
        <div className="forfeit-choice__text">
          <p id={messageId} className="forfeit-choice__message">
            {t('forfeit.message')}
          </p>
          {hosting
            ? <p className="forfeit-choice__hint">{t('forfeit.hostNote')}</p>
            : null}
        </div>
      </div>
    </Modal>
  );
}
