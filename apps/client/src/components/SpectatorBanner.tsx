import Button from '../design-system/components/Button/Button';
import { ActionIcon } from '../design-system/icons/ActionIcon';
import { useRoomExit } from '../roomExitContext';
import './style/RoomStatus.css';
import { useTranslation } from '../i18n/I18n';

/**
 * Tells a spectator what they can do and gives them the way out: a pill, the explanation and "Rời phòng", which runs the
 * app's own leave flow. Outside the app shell there is no flow to run, so the button is left out.
 */
export default function SpectatorBanner() {
  const { t } = useTranslation();
  const exit = useRoomExit();
  return (
    <aside className="spectator-banner" aria-label={t('spectator.label')}>
      <div className="spectator-banner__message" role="status">
        <span className="spectator-banner__pill">{t('spectator.mode')}</span>
        <span>{t('spectator.description')}</span>
      </div>
      {exit
        ? (
          <Button
            className="spectator-banner__leave"
            variant="secondary"
            icon={<ActionIcon name="leave" />}
            busy={exit.leaving}
            onClick={exit.requestLeave}
          >
            {exit.label}
          </Button>
        )
        : null}
    </aside>
  );
}
