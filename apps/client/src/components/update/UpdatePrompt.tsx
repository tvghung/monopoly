import type { ReactNode } from 'react';
import Button from '../../design-system/components/Button/Button';
import Modal from '../../design-system/components/Modal/Modal';
import { ActionIcon } from '../../design-system/icons/ActionIcon';
import { useAppUpdate } from '../../runtime/appUpdate';
import { useTranslation } from '../../i18n/I18n';
import type { AppUpdateState } from '../../runtime/types';
import UpdateProgress from './UpdateProgress';
import {
  applyLabel,
  failureMessage,
  offerBody,
  readyBody,
  getUpdateCopy,
} from './updateCopy';
import { promptKind, type UpdatePromptKind } from './updateView';
import './update.css';

interface UpdatePromptProps {
  /** The start screen shows its menu (not a form). */
  menuVisible: boolean;
  /** Quits the game from the start screen; without it a mandatory update has no "Thoát game" next to "Cập nhật". */
  onQuit?: () => void;
}

interface Content {
  title: string;
  body: ReactNode;
  footer: ReactNode;
  /** Escape and the close button do "Để sau"; a dialog the player has to answer has neither. */
  dismissible: boolean;
}

function RequiredBody({ state, language }: { state: AppUpdateState; language: 'vi' | 'en' }) {
  const copy = getUpdateCopy(language);
  return (
    <>
      <p className="update-prompt__text">{copy.requiredBody}</p>
      {state.phase === 'error' ? <p className="update-prompt__error" role="alert">{failureMessage(state, false, language)}</p> : null}
    </>
  );
}

/**
 * The start screen's dialogs for an update: the offer ("Có bản cập nhật mới" with "Cập nhật" and "Để sau"), the notice of a
 * mandatory update, the ready-to-restart question and the wait for the install. They are the central `Modal`, they open only
 * over the menu (never over a form) and never in a lobby or a game, and the choice that keeps the player where they are
 * ("Để sau") is the one that has the focus.
 */
export default function UpdatePrompt({ menuVisible, onQuit }: UpdatePromptProps) {
  const update = useAppUpdate();
  const { language } = useTranslation();
  const copy = getUpdateCopy(language);
  const { state } = update;
  const kind = promptKind({ state, inSession: update.inSession, deferred: update.deferred, menuVisible });

  const quit = onQuit
    ? <Button variant="ghost" icon={<ActionIcon name="leave" />} onClick={onQuit}>{copy.quit}</Button>
    : null;

  const content = (current: UpdatePromptKind, snapshot: AppUpdateState): Content => {
    switch (current) {
      case 'offer':
        return {
          title: copy.offerTitle,
          body: <p className="update-prompt__text">{offerBody(snapshot, language)}</p>,
          footer: (
            <>
              <Button data-modal-autofocus variant="ghost" onClick={update.defer}>{copy.later}</Button>
              <Button icon={<ActionIcon name="download" />} onClick={() => void update.download()}>{copy.update}</Button>
            </>
          ),
          dismissible: true,
        };
      case 'required': {
        // After a failed step the one button repeats that step: the download, or the install of what was downloaded.
        const failedInstall = snapshot.phase === 'error' && snapshot.error?.stage === 'install';
        return {
          title: copy.requiredTitle,
          body: <RequiredBody state={snapshot} language={language} />,
          footer: (
            <>
              {quit}
              <Button
                data-modal-autofocus
                icon={<ActionIcon name={snapshot.phase === 'error' ? 'retry' : 'download'} />}
                onClick={() => void (failedInstall ? update.install() : update.download())}
              >
                {snapshot.phase === 'error' ? copy.retry : copy.update}
              </Button>
            </>
          ),
          dismissible: false,
        };
      }
      case 'required-downloading':
        return {
          title: copy.requiredTitle,
          body: (
            <>
              <p className="update-prompt__text">{copy.requiredBody}</p>
              <UpdateProgress state={snapshot} />
            </>
          ),
          footer: <Button data-modal-autofocus variant="ghost" onClick={() => void update.cancelDownload()}>{copy.cancel}</Button>,
          dismissible: false,
        };
      case 'ready': {
        const mandatory = snapshot.update?.mandatory === true;
        return {
          title: copy.readyTitle,
          body: (
            <>
              {mandatory ? <p className="update-prompt__text">{copy.requiredBody}</p> : null}
              <p className="update-prompt__text">{readyBody(snapshot, language)}</p>
            </>
          ),
          footer: (
            <>
              {mandatory ? quit : <Button data-modal-autofocus variant="ghost" onClick={update.defer}>{copy.later}</Button>}
              <Button
                data-modal-autofocus={mandatory ? true : undefined}
                icon={<ActionIcon name={snapshot.installMode === 'restart' ? 'restart' : 'download'} />}
                onClick={() => void update.install()}
              >
                {applyLabel(snapshot, language)}
              </Button>
            </>
          ),
          dismissible: !mandatory,
        };
      }
      case 'installing':
        return {
          title: copy.installingTitle,
          body: (
            <div className="update-prompt__busy" role="status">
              <span className="update-prompt__spinner" aria-hidden="true" />
              <p className="update-prompt__text">{copy.installingBody}</p>
            </div>
          ),
          footer: null,
          dismissible: false,
        };
    }
  };

  // While the dialog closes, `Modal` keeps showing what it last rendered; with no state there is nothing to render.
  const shown = kind !== null && state !== null ? content(kind, state) : null;
  return (
    <Modal
      open={shown !== null}
      title={shown?.title ?? ''}
      size="sm"
      layer="card"
      closeOnEscape={shown?.dismissible ?? false}
      {...(shown?.dismissible ? { onClose: update.defer } : {})}
      footer={shown?.footer ?? undefined}
      className="update-prompt"
    >
      {shown?.body}
    </Modal>
  );
}
