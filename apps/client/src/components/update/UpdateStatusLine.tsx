import Button from '../../design-system/components/Button/Button';
import { useAppUpdate } from '../../runtime/appUpdate';
import { useTranslation } from '../../i18n/I18n';
import UpdateProgress from './UpdateProgress';
import { failureMessage, getUpdateCopy } from './updateCopy';
import { lineKind } from './updateView';
import './update.css';

/**
 * The one quiet line of the start screen for an update that is not a decision: the download under way ("Đang tải bản cập nhật
 * — 42%"), a download or install that failed, and the reason a ready update waits (a room of this machine is open). It
 * renders only over the menu, so it never pushes a form the player is filling in.
 */
export default function UpdateStatusLine({ menuVisible }: { menuVisible: boolean }) {
  const update = useAppUpdate();
  const { language } = useTranslation();
  const copy = getUpdateCopy(language);
  const { state } = update;
  const kind = menuVisible && state
    ? lineKind({ state, inSession: update.inSession, deferred: update.deferred, menuVisible })
    : null;
  if (!kind || !state) return null;

  if (kind === 'downloading') {
    return (
      <div className="update-line update-line--info">
        <UpdateProgress state={state} />
        <Button size="sm" variant="ghost" onClick={() => void update.cancelDownload()}>{copy.cancel}</Button>
      </div>
    );
  }

  if (kind === 'failed') {
    const failedInstall = state.error?.stage === 'install';
    return (
      <div className="update-line update-line--error">
        <p className="update-line__text" role="alert">{failureMessage(state, true, language)}</p>
        <div className="update-line__actions">
          <Button size="sm" variant="secondary" onClick={() => void (failedInstall ? update.install() : update.download())}>
            {copy.retry}
          </Button>
          <Button size="sm" variant="ghost" onClick={update.defer}>{copy.dismiss}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="update-line update-line--info">
      <p className="update-line__text" role="status">
        {state.update?.mandatory ? copy.requiredBlockedByRoom : copy.readyBlockedByRoom}
      </p>
    </div>
  );
}
