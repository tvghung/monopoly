import { useEffect, useRef, useState } from 'react';
import Button from '../design-system/components/Button/Button';
import ConfirmationDialog from '../design-system/components/ConfirmationDialog/ConfirmationDialog';
import Panel from '../design-system/components/Panel/Panel';
import SegmentedControl from '../design-system/components/SegmentedControl/SegmentedControl';
import { ActionIcon } from '../design-system/icons/ActionIcon';
import { HowToPlayButton } from '../howToPlay';
import { useAppUpdate } from '../runtime/appUpdate';
import { getDesktopBridge } from '../runtime/desktopBridge';
import { normalizeLanEndpoint } from '../runtime/lanEndpoint';
import { generateHostRoomCode } from '../runtime/lanSharing';
import { parseJoinInput, publicHttpsEndpoint } from '../runtime/joinTargetResolver';
import type {
  DesktopLaunchSelection,
  DesktopPlatform,
  HostRuntimeErrorCode,
  HostRuntimeStatus,
  LanFindRoomFailureCode,
  RuntimeConfig,
} from '../runtime/types';
import { useSettings, useSettingsAvailable } from '../settings/selectors';
import { useTranslation } from '../i18n/I18n';
import type { MessageKey } from '../i18n/catalog';
import SettingsPanel from '../settings/SettingsPanel';
import LanguageSelector from './LanguageSelector';
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
  HELPER_FAILED: 'launcher.hostStopped',
  READINESS_TIMEOUT: 'launcher.hostNotReady',
  PORT_OCCUPIED: 'launcher.hostUnavailable',
  BIND_DENIED: 'launcher.hostFirewall',
  NO_LAN_INTERFACE: 'launcher.noNetwork',
  RUNTIME_FAILED: 'launcher.hostFailed',
  CLOUDFLARED_MISSING: 'launcher.onlineToolMissing',
  CLOUDFLARED_CORRUPT: 'launcher.onlineToolMissing',
  REGISTRY_UNAVAILABLE: 'launcher.registryUnavailable',
  CODE_TAKEN: 'launcher.codeTaken',
  ONLINE_FAILED: 'launcher.onlineFailed',
};

type LauncherError =
  | { kind: 'message'; key: MessageKey; values?: Readonly<Record<string, string | number>> }
  | { kind: 'host'; code: HostRuntimeErrorCode }
  | { kind: 'ambiguous' }
  | { kind: 'find-room'; code: LanFindRoomFailureCode; roomCode: string };

function errorMessage(error: LauncherError, t: (key: MessageKey, values?: Readonly<Record<string, string | number>>) => string): string {
  if (error.kind === 'message') return t(error.key, error.values);
  if (error.kind === 'host') return t(hostErrorCopy[error.code]);
  if (error.kind === 'ambiguous') return t('launcher.ambiguousRoom');
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
  const [hostMode, setHostMode] = useState<'ONLINE' | 'LAN'>('ONLINE');
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
  };

  const startHost = async (): Promise<void> => {
    if (!bridge?.host || !name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      // The main process picks the network the device is connected to.
      let result: Awaited<ReturnType<NonNullable<typeof bridge.host>['start']>> | undefined;
      let nextRoomCode = generateHostRoomCode();
      for (let attempt = 0; attempt < (hostMode === 'ONLINE' ? 4 : 1); attempt += 1) {
        result = await bridge.host.start({ mode: hostMode, roomCode: nextRoomCode });
        if (result.ok || result.status.errorCode !== 'CODE_TAKEN') break;
        nextRoomCode = generateHostRoomCode();
      }
      if (!result) return;
      setHostStatus(result.status);
      if (!result.ok || !result.status.localEndpoint) {
        setError({ kind: 'host', code: result.status.errorCode ?? 'RUNTIME_FAILED' });
        return;
      }
      if (!result.status.lanAvailable) {
        setError({ kind: 'host', code: 'NO_LAN_INTERFACE' });
        return;
      }
      onReady({
        runtimeConfig: runtimeConfig(result.status.localEndpoint, result.status),
        initialJoin: { name: name.trim(), roomCode: nextRoomCode, hostCapability: result.hostCapability },
        targetRoomCode: nextRoomCode,
        hosting: true,
        connectionMode: hostMode,
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
    if (!name.trim() || searching || busy) return;
    const input = parseJoinInput(roomCode);
    if (input.kind === 'invalid') {
      setError({ kind: 'message', key: input.reason === 'CODE' ? 'launcher.invalidRoomCode' : 'launcher.invalidInvite' });
      return;
    }
    if (mode === 'configured') {
      const endpoint = configuredRuntimeConfig?.socketUrl;
      if (!endpoint) {
        setError({ kind: 'message', key: 'launcher.configuredUnavailable' });
        return;
      }
      enterRoom(endpoint, input.roomCode);
      return;
    }

    setError(null);
    if (input.kind === 'invitation') {
      enterRoom(input.endpoint, input.roomCode);
      return;
    }
    searchRef.current += 1;
    const attempt = searchRef.current;
    setSearching(true);
    const [lanResult, onlineResult] = await Promise.all([
      bridge?.lan?.findRoom(input.roomCode).catch(() => ({ ok: false, code: 'UNAVAILABLE' } as const)),
      bridge?.online?.findRoom(input.roomCode).catch(() => ({ ok: false, code: 'UNAVAILABLE' } as const)),
    ]);
    if (searchRef.current !== attempt) return;
    setSearching(false);
    const lanEndpoint = lanResult?.ok ? normalizeLanEndpoint(lanResult.endpoint) : undefined;
    const onlineEndpoint = onlineResult?.ok ? publicHttpsEndpoint(onlineResult.endpoint) : undefined;
    if (lanEndpoint && onlineEndpoint) {
      // An Online Host answers on its LAN too: the same process (same instance id) is one room, joined over the LAN.
      const sameHost = lanResult?.ok && onlineResult?.ok && lanResult.instanceId !== undefined
        && lanResult.instanceId === onlineResult.instanceId;
      if (sameHost) {
        enterRoom(lanEndpoint, input.roomCode);
        return;
      }
      setError({ kind: 'ambiguous' });
      return;
    }
    if (onlineEndpoint || lanEndpoint) enterRoom((onlineEndpoint || lanEndpoint) as string, input.roomCode);
    else if (onlineResult && !onlineResult.ok && onlineResult.code === 'UNAVAILABLE') setError({ kind: 'message', key: 'launcher.registryUnavailable' });
    else setError({ kind: 'find-room', code: lanResult?.ok ? 'UNAVAILABLE' : lanResult?.code ?? 'NOT_FOUND', roomCode: input.roomCode });
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
  const hostStarting = hostStatus?.state === 'STARTING_SERVER'
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
          <h1 id="desktop-launcher-title">{t('brand.name')}</h1>
        </header>

        {error ? <p className="desktop-launcher__error" role="alert">{errorMessage(error, t)}</p> : null}
        {hostStarting ? <p className="desktop-launcher__status" role="status">{t(hostStatus?.state === 'STARTING_SERVER' ? 'launcher.openingRoom' : 'launcher.closingRoom')}</p> : null}
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
                    connectionMode: hostStatus?.connectionMode ?? 'LAN',
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
              disabled={updateRequired || hostRunning}
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
                <LanguageSelector
                  className="desktop-launcher__language"
                  value={language}
                  onChange={next => updateSettings({ language: next })}
                />
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

              {mode === 'host' ? (
                <div className="desktop-launcher__field">
                  <SegmentedControl
                    label={t('launcher.connectionMode')}
                    options={[
                      { value: 'ONLINE', label: t('launcher.onlineMode') },
                      { value: 'LAN', label: t('launcher.lanMode') },
                    ]}
                    value={hostMode}
                    onChange={value => { setHostMode(value); setError(null); }}
                  />
                </div>
              ) : null}

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
                    <label className="entry-label" htmlFor="desktop-lan-room">{t(mode === 'join' ? 'launcher.roomOrLink' : 'launcher.roomCode')}</label>
                    <input
                      id="desktop-lan-room"
                      className="entry-control"
                      value={roomCode}
                      maxLength={500}
                      placeholder={t(mode === 'join' ? 'launcher.roomOrLinkPlaceholder' : 'launcher.roomCodePlaceholder')}
                      autoCapitalize="none"
                      readOnly={searching}
                      onChange={event => {
                        setRoomCode(event.target.value);
                        // The line above the form was about the code that was just changed.
                        setError(null);
                      }}
                    />
                  </div>
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
                    ? t(hostStatus?.state === 'STARTING_SERVER' ? 'launcher.openingRoom' : 'launcher.preparing')
                    : t(mode === 'host' ? 'launcher.createAndJoin' : 'launcher.connectAndJoin')}
              </Button>
              {submitReason && !working ? (
                // Not drawn (the empty field says it); it still tells assistive technology why the button is off.
                <p id="desktop-submit-reason" className="sr-only">{submitReason}</p>
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
