import Button from '../../design-system/components/Button/Button';
import { ActionIcon } from '../../design-system/icons/ActionIcon';
import { useAppUpdate } from '../../runtime/appUpdate';
import UpdateProgress from './UpdateProgress';
import { applyLabel, settingsStatus, UPDATE_COPY } from './updateCopy';
import './update.css';

/**
 * The body of the "Cập nhật" section of the settings dialog, for the desktop app: the running version, one sentence for what
 * the updater is doing, and the action that fits ("Kiểm tra cập nhật", "Cập nhật", "Hủy", the restart, "Thử lại"). The
 * dialog is also open in a game, where an update may be found and downloaded but not applied, and says so.
 */
export default function UpdateSettingsContent() {
  const update = useAppUpdate();
  const { state } = update;
  if (!state) return null;

  const { phase } = state;
  const checkable = phase === 'idle' || phase === 'up-to-date' || (phase === 'error' && state.error?.stage === 'check');
  const failedInstall = phase === 'error' && state.error?.stage === 'install';

  return (
    <>
      <p className="update-settings__version">
        Phiên bản hiện tại: <strong>{state.currentVersion}</strong>
      </p>
      {phase === 'downloading'
        ? <UpdateProgress state={state} />
        : <p className="settings-panel__hint" role="status" aria-live="polite">{settingsStatus(state, update.inSession)}</p>}
      <div className="update-settings__actions">
        {checkable || phase === 'checking' ? (
          <Button
            variant="secondary"
            icon={<ActionIcon name="refresh" />}
            busy={phase === 'checking'}
            onClick={() => void update.check()}
          >
            {phase === 'checking' ? UPDATE_COPY.checking : UPDATE_COPY.check}
          </Button>
        ) : null}
        {phase === 'available' ? (
          <Button icon={<ActionIcon name="download" />} onClick={() => void update.download()}>{UPDATE_COPY.update}</Button>
        ) : null}
        {phase === 'downloading' ? (
          <Button variant="ghost" onClick={() => void update.cancelDownload()}>{UPDATE_COPY.cancel}</Button>
        ) : null}
        {phase === 'ready' ? (
          <Button
            icon={<ActionIcon name={state.installMode === 'restart' ? 'restart' : 'download'} />}
            disabled={!update.canApply}
            onClick={() => void update.install()}
          >
            {applyLabel(state)}
          </Button>
        ) : null}
        {phase === 'error' && !checkable ? (
          <Button
            icon={<ActionIcon name="retry" />}
            disabled={failedInstall && !update.canApply}
            onClick={() => void (failedInstall ? update.install() : update.download())}
          >
            {UPDATE_COPY.retry}
          </Button>
        ) : null}
      </div>
    </>
  );
}
