import { useEffect, useRef, useState } from 'react';
import { Languages } from 'lucide-react';
import Button from '../design-system/components/Button/Button';
import ConfirmationDialog from '../design-system/components/ConfirmationDialog/ConfirmationDialog';
import Panel from '../design-system/components/Panel/Panel';
import { ActionIcon } from '../design-system/icons/ActionIcon';
import { HowToPlayButton } from '../howToPlay';
import { useAppUpdate } from '../runtime/appUpdate';
import { getDesktopBridge } from '../runtime/desktopBridge';
import { normalizeLanEndpoint } from '../runtime/lanEndpoint';
import { generateHostRoomCode, normalizeRoomCode, parseLanJoinUrl } from '../runtime/lanSharing';
import type {
  DesktopLaunchSelection,
  DesktopPlatform,
  HostRuntimeErrorCode,
  HostRuntimeStatus,
  LanFindRoomFailureCode,
  LanFindRoomResult,
  RuntimeConfig,
} from '../runtime/types';
import { useSettings, useSettingsAvailable } from '../settings/selectors';
import { useTranslation } from '../i18n/I18n';
import type { MessageKey } from '../i18n/catalog';
import SettingsPanel from '../settings/SettingsPanel';
import LauncherScene from './LauncherScene';
import UpdatePrompt from './update/UpdatePrompt';
import UpdateStatusLine from './update/UpdateStatusLine';
import './style/EntryShared.css';
import './style/DesktopMultiplayerLauncher.css';

type LauncherMode = 'host' | 'join' | 'configured' | null;

interface DesktopMultiplayerLauncherProps {
  configuredRuntimeConfig?: RuntimeConfig;
  configurationError?: string | null;
  onReady: (selection: DesktopLaunchSelection) => void;
  /** Opens a form directly, for design-lab captures; the launcher itself always starts on the choices. */
  initialMode?: Exclude<LauncherMode, null>;
  /** Fills the join form, optionally after a failed search, for design-lab captures. */
  initialJoin?: { name: string; roomCode: string; failure?: LanFindRoomFailureCode };
}

const modeTitle: Record<Exclude<LauncherMode, null>, MessageKey> = {
  host: 'launcher.host',
  join: 'launcher.join',
  configured: 'launcher.configured',
};

/** If the window is still open this long after "Thoát" was accepted, the button is usable again. */
const QUIT_PATIENCE_MS = 10_000;

const hostErrorCopy: Record<HostRuntimeErrorCode, MessageKey> = {
  POSTGRES_RESOURCES_MISSING: 'launcher.hostMissingFiles',
  POSTGRES_INITIALIZATION_FAILED: 'launcher.hostDataFailed',
  MIGRATION_FAILED: 'launcher.hostMigrationFailed',
  HELPER_FAILED: 'launcher.hostStopped',
  READINESS_TIMEOUT: 'launcher.hostNotReady',
  PORT_OCCUPIED: 'launcher.hostUnavailable',
  BIND_DENIED: 'launcher.hostFirewall',
  NO_LAN_INTERFACE: 'launcher.noNetwork',
  RUNTIME_FAILED: 'launcher.hostFailed',
};

type LauncherError =
  | { kind: 'message'; key: MessageKey; values?: Readonly<Record<string, string | number>> }
  | { kind: 'host'; code: HostRuntimeErrorCode }
  | { kind: 'find-room'; code: LanFindRoomFailureCode; roomCode: string };

function errorMessage(error: LauncherError, t: (key: MessageKey, values?: Readonly<Record<string, string | number>>) => string): string {
  if (error.kind === 'message') return t(error.key, error.values);
  if (error.kind === 'host') return t(hostErrorCopy[error.code]);
  switch (error.code) {
    case 'NOT_FOUND':
      return t('launcher.roomNotFound', { roomCode: error.roomCode });
    case 'UNREACHABLE':
      return t('launcher.roomUnreachable');
    case 'NO_NETWORK':
      return t('launcher.noNetwork');
    case 'UNAVAILABLE':
      return t('launcher.roomSearchUnavailable');
  }
}

function fallbackPlatform(): DesktopPlatform {
  return typeof navigator !== 'undefined' && /macintosh|mac os/iu.test(navigator.userAgent)
    ? 'darwin'
    : 'win32';
}

function runtimeConfig(endpoint: string, status?: HostRuntimeStatus): DesktopLaunchSelection['runtimeConfig'] {
  return {
    target: 'desktop',
    socketUrl: endpoint,
    platform: status?.platform ?? fallbackPlatform(),
    appVersion: status?.appVersion ?? 'unknown',
  };
}

/** A room of this machine is open (or opening): quitting would close it for everyone in it. */
function hostIsOpen(status?: HostRuntimeStatus): boolean {
  return status?.state === 'HOSTING'
    || status?.state === 'READY'
    || status?.state === 'STARTING_POSTGRES'
    || status?.state === 'STARTING_SERVER';
}

/**
 * The start screen of the desktop app, laid out like a game's main menu: the buttons in a column on the left over a
 * picture whose artwork sits on the right. It holds no explanation under any button; the words are the button labels. The
 * forms ("Tạo phòng", "Tham gia phòng") open in the same left column.
 *
 * It renders in the app's root, outside the audio and toast providers. The renderer-root `SettingsProvider` keeps its
 * language and preferences available here; with none above (an isolated render) settings are unavailable, like "Hướng dẫn chơi" without its
 * provider and "Thoát" without a bridge that can quit.
 */
export default function DesktopMultiplayerLauncher({
  configuredRuntimeConfig,
  configurationError,
  onReady,
  initialMode,
  initialJoin,
}: DesktopMultiplayerLauncherProps) {
  const { t, language } = useTranslation();
  const { updateSettings } = useSettings();
  const bridge = getDesktopBridge();
  const settingsAvailable = useSettingsAvailable();
  // A mandatory update blocks starting and joining a multiplayer room; the update dialog says why and offers the update.
  const { locked: updateRequired } = useAppUpdate();
  const [mode, setMode] = useState<LauncherMode>(initialMode ?? null);
  const rootRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<Exclude<LauncherMode, null> | null>(null);
  // Counts room searches: a result that arrives after the player went back or searched again is dropped.
  const searchRef = useRef(0);
  const [name, setName] = useState(initialJoin?.name ?? '');
  const [roomCode, setRoomCode] = useState(initialJoin?.roomCode ?? '');
  const [inviteLink, setInviteLink] = useState('');
  // The invitation-link field is only offered once looking for the room by its code has failed.
  const [inviteOffered, setInviteOffered] = useState(
    initialJoin?.failure !== undefined && initialJoin.failure !== 'NO_NETWORK',
  );
  const [hostStatus, setHostStatus] = useState<HostRuntimeStatus | undefined>();
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const [error, setError] = useState<LauncherError | null>(() => configurationError
    ? { kind: 'message', key: 'launcher.configurationError' }
    : initialJoin?.failure ? { kind: 'find-room', code: initialJoin.failure, roomCode: initialJoin.roomCode } : null);

  useEffect(() => {
    if (!bridge?.host) return undefined;
    let active = true;
    void bridge.host.getStatus().then(status => {
      if (active) setHostStatus(status);
    }).catch(() => undefined);
    const remove = bridge.host.onStatusChanged(status => {
      if (active) setHostStatus(status);
    });
    return () => {
      active = false;
      remove();
    };
  }, [bridge]);

  useEffect(() => {
    if (configurationError) setError({ kind: 'message', key: 'launcher.configurationError' });
  }, [configurationError]);

  // Leaving a form with "Quay lại" removes the focused button: put the focus on the button that opened the form.
  useEffect(() => {
    if (mode !== null || !returnFocusRef.current) return;
    const choice = returnFocusRef.current;
    returnFocusRef.current = null;
    rootRef.current?.querySelector<HTMLElement>(`[data-launcher-choice="${choice}"]`)?.focus();
  }, [mode]);

  // A search that is still running when the launcher goes away must not launch anything.
  useEffect(() => () => { searchRef.current += 1; }, []);

  // The app is closing once "Thoát" is accepted; if it somehow is not, the button comes back.
  useEffect(() => {
    if (!quitting) return undefined;
    const timer = window.setTimeout(() => setQuitting(false), QUIT_PATIENCE_MS);
    return () => window.clearTimeout(timer);
  }, [quitting]);

  // Opening the host form checks the network once, so a missing connection is said before the player types a name.
  useEffect(() => {
    if (mode !== 'host' || !bridge?.host) return undefined;
    let active = true;
    void bridge.host.refreshNetwork().then(status => {
      if (!active) return;
      setHostStatus(status);
      if (status.interfaces.length === 0) setError({ kind: 'message', key: 'launcher.noNetwork' });
    }).catch(() => {
      if (active) setError({ kind: 'message', key: 'launcher.noNetwork' });
    });
    return () => {
      active = false;
    };
  }, [bridge, mode]);

  const openMode = (next: Exclude<LauncherMode, null>): void => {
    if (updateRequired) return;
    setMode(next);
    setError(null);
    setInviteLink('');
    setInviteOffered(false);
  };

  const startHost = async (): Promise<void> => {
    if (!bridge?.host || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // The main process picks the network the device is connected to.
      const result = await bridge.host.start();
      setHostStatus(result.status);
      if (!result.ok || !result.status.localEndpoint) {
        setError({ kind: 'host', code: result.status.errorCode ?? 'RUNTIME_FAILED' });
        return;
      }
      if (!result.status.lanAvailable) {
        setError({ kind: 'host', code: 'NO_LAN_INTERFACE' });
        return;
      }
      const nextRoomCode = generateHostRoomCode();
      onReady({
        runtimeConfig: runtimeConfig(result.status.localEndpoint, result.status),
        initialJoin: { name: name.trim(), roomCode: nextRoomCode },
        targetRoomCode: nextRoomCode,
        hosting: true,
      });
    } catch {
      const latest = await bridge.host.getStatus().catch(() => hostStatus);
      setHostStatus(latest);
      setError({ kind: 'host', code: latest?.errorCode ?? 'RUNTIME_FAILED' });
    } finally {
      setBusy(false);
    }
  };

  const enterRoom = (endpoint: string, code: string): void => {
    onReady({
      runtimeConfig: mode === 'configured'
        ? {
          target: 'desktop',
          socketUrl: endpoint,
          platform: configuredRuntimeConfig?.platform ?? fallbackPlatform(),
          appVersion: configuredRuntimeConfig?.appVersion ?? 'unknown',
        }
        : runtimeConfig(endpoint, hostStatus),
      initialJoin: { name: name.trim(), roomCode: code },
      targetRoomCode: code,
      hosting: false,
    });
  };

  const joinRoom = async (): Promise<void> => {
    if (!name.trim()) return;
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    if (!normalizedRoomCode) {
      setError({ kind: 'message', key: 'launcher.invalidRoomCode' });
      return;
    }
    if (mode === 'configured') {
      const endpoint = configuredRuntimeConfig?.socketUrl;
      if (!endpoint) {
        setError({ kind: 'message', key: 'launcher.configuredUnavailable' });
        return;
      }
      enterRoom(endpoint, normalizedRoomCode);
      return;
    }

    setError(null);
    // A pasted invitation link already names the Host: no search is needed.
    if (inviteLink.trim()) {
      const invitation = parseLanJoinUrl(inviteLink);
      if (!invitation) {
        setError({ kind: 'message', key: 'launcher.invalidInvite' });
        return;
      }
      enterRoom(invitation.endpoint, invitation.roomCode);
      return;
    }

    const failSearch = (code: LanFindRoomFailureCode): void => {
      setError({ kind: 'find-room', code, roomCode: normalizedRoomCode });
      if (code !== 'NO_NETWORK') setInviteOffered(true);
    };
    const lan = bridge?.lan;
    if (!lan) {
      failSearch('UNAVAILABLE');
      return;
    }
    searchRef.current += 1;
    const attempt = searchRef.current;
    setSearching(true);
    let result: LanFindRoomResult;
    try {
      result = await lan.findRoom(normalizedRoomCode);
    } catch {
      result = { ok: false, code: 'UNAVAILABLE' };
    }
    if (searchRef.current !== attempt) return;
    setSearching(false);
    if (!result.ok) {
      failSearch(result.code);
      return;
    }
    const endpoint = normalizeLanEndpoint(result.endpoint);
    if (!endpoint) {
      failSearch('UNAVAILABLE');
      return;
    }
    enterRoom(endpoint, normalizedRoomCode);
  };

  const stopHost = async (): Promise<void> => {
    if (!bridge?.host) return;
    setBusy(true);
    setError(null);
    const result = await bridge.host.stop();
    setHostStatus(result.status);
    if (!result.ok) setError({ kind: 'host', code: result.status.errorCode ?? 'RUNTIME_FAILED' });
    setBusy(false);
  };

  /** The main process stops a running Host on its way out, exactly as it does when the window is closed. */
  const quitApp = async (): Promise<void> => {
    const quit = bridge?.quit;
    if (!quit?.exitApp) return;
    setQuitConfirmOpen(false);
    setQuitting(true);
    setError(null);
    try {
      await quit.exitApp();
    } catch {
      setQuitting(false);
      setError({ kind: 'message', key: 'launcher.quitFailed' });
    }
  };

  if (!bridge) return null;
  const hostStarting = hostStatus?.state === 'STARTING_POSTGRES'
    || hostStatus?.state === 'STARTING_SERVER'
    || hostStatus?.state === 'STOPPING';
  const working = busy || hostStarting || searching;
  const canQuit = typeof bridge.quit?.exitApp === 'function';
  // The written reason the submit button is disabled; starting says so in its own line.
  const submitReason = !name.trim()
    ? t('launcher.enterNameHint')
    : mode !== 'host' && !roomCode.trim() ? t('launcher.enterCodeHint') : null;
  const hostRunning = hostStatus?.state === 'HOSTING' && Boolean(hostStatus.localEndpoint);

  return (
    <main
      ref={rootRef}
      className="desktop-launcher"
      data-launcher-view={mode === null ? 'menu' : 'form'}
      aria-labelledby="desktop-launcher-title"
    >
      <LauncherScene />

      <div className="desktop-launcher__content">
        <header className="desktop-launcher__header">
          <p className="desktop-launcher__brand" aria-hidden="true">{t('brand.name')}</p>
          <h1 id="desktop-launcher-title">{t('launcher.playOverLan')}</h1>
        </header>

        {error ? <p className="desktop-launcher__error" role="alert">{errorMessage(error, t)}</p> : null}
        {hostStarting ? <p className="desktop-launcher__status" role="status">{t(hostStatus?.state === 'STARTING_POSTGRES' ? 'launcher.startingRoom' : hostStatus?.state === 'STARTING_SERVER' ? 'launcher.openingRoom' : 'launcher.closingRoom')}</p> : null}
        <UpdateStatusLine menuVisible={mode === null} />

        {mode === null ? (
          <div className="desktop-launcher__menu">
            {hostRunning ? (
              <div className="desktop-launcher__running">
                <Button
                  size="lg"
                  className="desktop-launcher__action"
                  icon={<ActionIcon name="start" className="action-icon--only" />}
                  onClick={() => onReady({
                    runtimeConfig: runtimeConfig(hostStatus?.localEndpoint as string, hostStatus),
                    hosting: true,
                  })}
                >{t('launcher.roomOpen')}</Button>
                <Button
                  variant="ghost"
                  className="desktop-launcher__action desktop-launcher__stop"
                  icon={<ActionIcon name="stopHost" className="action-icon--only" />}
                  disabled={busy}
                  onClick={() => void stopHost()}
                >{t('launcher.closeRoom')}</Button>
              </div>
            ) : null}
            <Button
              size="xl"
              variant={hostRunning ? 'secondary' : 'primary'}
              className="desktop-launcher__action"
              data-launcher-choice="host"
              icon={<ActionIcon name="host" className="action-icon--only" />}
              disabled={updateRequired}
              onClick={() => openMode('host')}
            >{t(modeTitle.host)}</Button>
            <Button
              size="xl"
              variant="secondary"
              className="desktop-launcher__action"
              data-launcher-choice="join"
              icon={<ActionIcon name="join" className="action-icon--only" />}
              disabled={updateRequired}
              onClick={() => openMode('join')}
            >{t(modeTitle.join)}</Button>
            {configuredRuntimeConfig?.socketUrl ? (
              <Button
                size="lg"
                variant="ghost"
                className="desktop-launcher__action"
                data-launcher-choice="configured"
                icon={<ActionIcon name="configuredServer" className="action-icon--only" />}
                disabled={updateRequired}
                onClick={() => openMode('configured')}
              >{t(modeTitle.configured)}</Button>
            ) : null}
            {settingsAvailable || canQuit ? (
              <div className="desktop-launcher__utility">
                {settingsAvailable ? (
                  <Button
                    variant="ghost"
                    className="desktop-launcher__action"
                    icon={<ActionIcon name="settings" className="action-icon--only" />}
                    aria-haspopup="dialog"
                    onClick={() => setSettingsOpen(true)}
                  >{t('launcher.settings')}</Button>
                ) : null}
                <Button
                  variant="ghost"
                  className="desktop-launcher__action desktop-launcher__language"
                  icon={<Languages className="action-icon--only" aria-hidden="true" />}
                  aria-label={t(language === 'vi' ? 'launcher.switchToEnglish' : 'launcher.switchToVietnamese')}
                  onClick={() => updateSettings({ language: language === 'vi' ? 'en' : 'vi' })}
                >{t(language === 'vi' ? 'language.english' : 'language.vietnamese')}</Button>
                {canQuit ? (
                  <Button
                    variant="ghost"
                    className="desktop-launcher__action"
                    icon={quitting ? undefined : <ActionIcon name="leave" className="action-icon--only" />}
                    busy={quitting}
                    onClick={() => {
                      if (hostIsOpen(hostStatus)) setQuitConfirmOpen(true);
                      else void quitApp();
                    }}
                  >{t(quitting ? 'launcher.quitting' : 'launcher.quit')}</Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <Panel as="section" padding="lg" className="desktop-launcher__card">
            <form className="desktop-launcher__form" onSubmit={event => {
              event.preventDefault();
              void (mode === 'host' ? startHost() : joinRoom());
            }}>
              <Button
                variant="ghost"
                className="desktop-launcher__back"
                icon={<ActionIcon name="back" className="action-icon--only" />}
                onClick={() => {
                  searchRef.current += 1;
                  setSearching(false);
                  returnFocusRef.current = mode;
                  setMode(null);
                }}
              >{t('launcher.back')}</Button>
              <h2>{t(modeTitle[mode])}</h2>

              <div className="desktop-launcher__field">
                <label className="entry-label" htmlFor="desktop-player-name">{t('launcher.playerName')}</label>
                <input
                  id="desktop-player-name"
                  className="entry-control"
                  value={name}
                  maxLength={20}
                  placeholder={t('launcher.playerNamePlaceholder')}
                  readOnly={searching}
                  onChange={event => setName(event.target.value)}
                  autoFocus
                  autoComplete="nickname"
                />
              </div>

              {mode === 'host' ? null : (
                <>
                  {mode === 'configured' ? (
                    <p className="desktop-launcher__endpoint" role="note">
                      {t('launcher.configuredAddress')} <code>{configuredRuntimeConfig?.socketUrl}</code>
                    </p>
                  ) : null}
                  <div className="desktop-launcher__field">
                    <label className="entry-label" htmlFor="desktop-lan-room">{t('launcher.roomCode')}</label>
                    <input
                      id="desktop-lan-room"
                      className="entry-control"
                      value={roomCode}
                      maxLength={20}
                      placeholder={t('launcher.roomCodePlaceholder')}
                      autoCapitalize="characters"
                      readOnly={searching}
                      onChange={event => {
                        setRoomCode(event.target.value.toUpperCase());
                        // The line above the form was about the code that was just changed.
                        setError(null);
                      }}
                    />
                  </div>
                  {mode === 'join' && inviteOffered ? (
                    <div className="desktop-launcher__field">
                      <label className="entry-label" htmlFor="desktop-lan-invite">{t('launcher.inviteLink')}</label>
                      <input
                        id="desktop-lan-invite"
                        className="entry-control"
                        value={inviteLink}
                        placeholder={t('launcher.inviteLinkPlaceholder')}
                        inputMode="url"
                        autoCapitalize="none"
                        autoComplete="off"
                        spellCheck={false}
                        readOnly={searching}
                        onChange={event => {
                          const value = event.target.value;
                          setInviteLink(value);
                          setError(null);
                          // The link names its room, so the code field follows what was pasted.
                          const invitation = parseLanJoinUrl(value);
                          if (invitation) setRoomCode(invitation.roomCode);
                        }}
                      />
                    </div>
                  ) : null}
                </>
              )}

              <Button
                type="submit"
                size="lg"
                className="desktop-launcher__submit"
                icon={working ? undefined : <ActionIcon name={mode === 'host' ? 'host' : 'join'} className="action-icon--only" />}
                busy={working}
                disabled={!name.trim() || (mode !== 'host' && !roomCode.trim())}
                aria-describedby={submitReason && !working ? 'desktop-submit-reason' : undefined}
              >
                {searching
                  ? t('launcher.findingRoom')
                  : working
                    ? t(hostStatus?.state === 'STARTING_POSTGRES' ? 'launcher.startingRoom' : hostStatus?.state === 'STARTING_SERVER' ? 'launcher.openingRoom' : 'launcher.preparing')
                    : t(mode === 'host' ? 'launcher.createAndJoin' : 'launcher.connectAndJoin')}
              </Button>
              {submitReason && !working ? (
                <p id="desktop-submit-reason" className="desktop-launcher__hint desktop-launcher__reason">{submitReason}</p>
              ) : null}
            </form>
          </Panel>
        )}

        {/* Last in the tab order, first in the corner: the menu is what a player reaches first. */}
        <HowToPlayButton variant="labelled" placement="corner" className="desktop-launcher__help" />
      </div>

      {settingsAvailable ? <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} /> : null}
      <UpdatePrompt
        menuVisible={mode === null}
        {...(canQuit ? { onQuit: () => { if (hostIsOpen(hostStatus)) setQuitConfirmOpen(true); else void quitApp(); } } : {})}
      />
      <ConfirmationDialog
        open={quitConfirmOpen}
        title={t('launcher.confirmQuitTitle')}
        message={t('launcher.confirmQuitMessage')}
        confirmLabel={t('launcher.confirmQuit')}
        confirmIcon={<ActionIcon name="leave" />}
        cancelLabel={t('launcher.stay')}
        onCancel={() => setQuitConfirmOpen(false)}
        onConfirm={() => void quitApp()}
      />
    </main>
  );
}
