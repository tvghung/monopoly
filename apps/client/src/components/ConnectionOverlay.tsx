import { useId, useState, type FormEvent } from 'react';
import Button from '../design-system/components/Button/Button';
import Panel from '../design-system/components/Panel/Panel';
import { ActionIcon } from '../design-system/icons/ActionIcon';
import HowToPlayButton from '../howToPlay/HowToPlayButton';
import { parseJoinInput } from '../runtime/joinTargetResolver';
import './style/RoomStatus.css';
import { useTranslation } from '../i18n/I18n';

interface ConnectionOverlayProps {
  message?: string;
  /**
   * The reconnection has not succeeded for a while: the Host's link may have changed (a new tunnel address). The player can
   * paste the new invitation of the same room to come back to their own seat; their token never leaves this device.
   */
  stalled?: boolean;
  roomCode?: string;
  onUseNewLink?: (endpoint: string, roomCode: string) => void;
}

/**
 * Shown over the game while the socket reconnects; it sits above the card layer so a card reveal cannot hide it. The status
 * is the card alone, so the how-to-play key beside it (reading the rules is a good way to wait) is not announced with it.
 */
export default function ConnectionOverlay({
  message,
  stalled = false,
  roomCode,
  onUseNewLink,
}: ConnectionOverlayProps) {
  const { t } = useTranslation();
  const fieldId = useId();
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const offerLink = stalled && Boolean(roomCode && onUseNewLink);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const input = parseJoinInput(link);
    if (input.kind !== 'invitation') {
      setLinkError(t('connection.badLink'));
      return;
    }
    if (input.roomCode !== roomCode) {
      setLinkError(t('connection.wrongRoom'));
      return;
    }
    setLinkError(null);
    onUseNewLink?.(input.endpoint, input.roomCode);
  };

  return (
    <div className="connection-overlay">
      <div className="connection-overlay__status" role="status" aria-live="polite">
        <Panel as="div" padding="lg" className="connection-overlay__card">
          <span className="connection-overlay__spinner" aria-hidden="true" />
          <p>{message ?? t('connection.reconnecting')}</p>
        </Panel>
      </div>
      {offerLink ? (
        <Panel as="div" padding="md" className="connection-overlay__relink">
          <form className="connection-overlay__form" onSubmit={submit}>
            <p className="connection-overlay__hint">{t('connection.stalled')}</p>
            <label className="entry-label" htmlFor={fieldId}>{t('connection.newLink')}</label>
            <input
              id={fieldId}
              className="entry-control"
              type="url"
              inputMode="url"
              value={link}
              maxLength={500}
              placeholder="https://…/?room=OTB-…"
              onChange={event => {
                setLink(event.target.value);
                setLinkError(null);
              }}
            />
            {linkError ? <p className="connection-overlay__error" role="alert">{linkError}</p> : null}
            <Button type="submit" icon={<ActionIcon name="link" />} disabled={!link.trim()}>
              {t('connection.useLink')}
            </Button>
          </form>
        </Panel>
      ) : null}
      <HowToPlayButton placement="corner" />
    </div>
  );
}
