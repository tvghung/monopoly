import { useEffect, useRef, useState } from 'react';
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
import { useSettingsAvailable } from '../settings/selectors';
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

const modeTitle: Record<Exclude<LauncherMode, null>, string> = {
  host: 'Tạo phòng',
  join: 'Tham gia phòng',
  configured: 'Máy chủ riêng',
};

const NO_NETWORK_COPY = 'Máy này chưa kết nối mạng. Hãy bật Wi-Fi hoặc cắm dây mạng.';
const QUIT_FAILED_COPY = 'Chưa thoát được game. Hãy thử lại.';
/** If the window is still open this long after "Thoát" was accepted, the button is usable again. */
const QUIT_PATIENCE_MS = 10_000;

/** What a player reads when the room cannot be opened on this machine: no ports, servers or databases, and what to do. */
const hostErrorCopy: Record<HostRuntimeErrorCode, string> = {
  POSTGRES_RESOURCES_MISSING: 'Ứng dụng thiếu tệp cần thiết để mở phòng. Hãy cài lại ứng dụng rồi thử lại.',
  POSTGRES_INITIALIZATION_FAILED: 'Không mở được dữ liệu các phòng đã lưu. Dữ liệu không bị đặt lại. Hãy thử lại.',
  MIGRATION_FAILED: 'Không thể cập nhật dữ liệu trò chơi trên máy này. Hãy thử lại.',
  HELPER_FAILED: 'Phòng trên máy này đã dừng. Hãy thử tạo lại phòng.',
  READINESS_TIMEOUT: 'Phòng chưa sẵn sàng kịp thời. Hãy thử lại.',
  PORT_OCCUPIED: 'Chưa mở được phòng. Hãy thử lại.',
  BIND_DENIED: 'Máy này chưa cho mở phòng. Hãy bấm Cho phép khi tường lửa hỏi rồi thử lại.',
  NO_LAN_INTERFACE: NO_NETWORK_COPY,
  RUNTIME_FAILED: 'Không thể tạo phòng. Hãy thử lại.',
};

/** What a player reads when the room could not be found; every line says what to do next. */
function findRoomFailureCopy(code: LanFindRoomFailureCode, roomCode: string): string {
  switch (code) {
    case 'NOT_FOUND':
      return `Không tìm thấy phòng ${roomCode}. Kiểm tra lại mã và chắc chắn máy tạo phòng đang mở game, cùng Wi-Fi với bạn.`;
    case 'UNREACHABLE':
      return 'Tìm thấy phòng nhưng chưa kết nối được. Nhờ chủ phòng bấm Cho phép khi tường lửa hỏi.';
    case 'NO_NETWORK':
      return NO_NETWORK_COPY;
    case 'UNAVAILABLE':
      return 'Không thể tìm phòng tự động. Hãy dán liên kết mời.';
  }
}

const INVALID_INVITE_COPY = 'Liên kết mời chưa đúng. Hãy dán lại liên kết do chủ phòng gửi.';

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

function statusError(status?: HostRuntimeStatus): string {
  return status?.errorCode ? hostErrorCopy[status.errorCode] : hostErrorCopy.RUNTIME_FAILED;
}

/** The two start-up steps differ for the main process, not for the player: both are "getting the room ready". */
function startingLabel(status?: HostRuntimeStatus): string {
  if (status?.state === 'STARTING_POSTGRES') return 'Đang chuẩn bị phòng…';
  if (status?.state === 'STARTING_SERVER') return 'Đang mở phòng…';
  if (status?.state === 'STOPPING') return 'Đang đóng phòng…';
  return 'Đang chuẩn bị…';
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
 * It renders in the app's root, outside the audio and toast providers. `AppBootstrap` wraps it in a `SettingsProvider` so the
 * "Cài đặt" dialog works; with none above (an isolated render) that button is simply absent, like "Hướng dẫn chơi" without its
 * provider and "Thoát" without a bridge that can quit.
 */
export default function DesktopMultiplayerLauncher({
  configuredRuntimeConfig,
  configurationError,
  onReady,
  initialMode,
  initialJoin,
}: DesktopMultiplayerLauncherProps) {
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
  const [error, setError] = useState<string | null>(
    configurationError
      ?? (initialJoin?.failure ? findRoomFailureCopy(initialJoin.failure, initialJoin.roomCode) : null),
  );

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
    if (configurationError) setError(configurationError);
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
      if (status.interfaces.length === 0) setError(NO_NETWORK_COPY);
    }).catch(() => {
      if (active) setError(NO_NETWORK_COPY);
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
        setError(statusError(result.status));
        return;
      }
      if (!result.status.lanAvailable) {
        setError(hostErrorCopy.NO_LAN_INTERFACE);
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
      setError(statusError(latest));
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
      setError('Mã phòng phải có 1–20 ký tự chữ, số hoặc dấu gạch ngang.');
      return;
    }
    if (mode === 'configured') {
      const endpoint = configuredRuntimeConfig?.socketUrl;
      if (!endpoint) {
        setError('Địa chỉ máy chủ đã cấu hình không khả dụng.');
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
        setError(INVALID_INVITE_COPY);
        return;
      }
      enterRoom(invitation.endpoint, invitation.roomCode);
      return;
    }

    const failSearch = (code: LanFindRoomFailureCode): void => {
      setError(findRoomFailureCopy(code, normalizedRoomCode));
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
    if (!result.ok) setError(statusError(result.status));
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
      setError(QUIT_FAILED_COPY);
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
    ? 'Nhập tên của bạn để tiếp tục.'
    : mode !== 'host' && !roomCode.trim() ? 'Nhập mã phòng do chủ phòng chia sẻ.' : null;
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
          <p className="desktop-launcher__brand" aria-hidden="true">OWN THE BLOCK</p>
          <h1 id="desktop-launcher-title">Chơi qua mạng LAN</h1>
        </header>

        {error ? <p className="desktop-launcher__error" role="alert">{error}</p> : null}
        {hostStarting ? <p className="desktop-launcher__status" role="status">{startingLabel(hostStatus)}</p> : null}
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
                >Vào lại phòng đang mở</Button>
                <Button
                  variant="ghost"
                  className="desktop-launcher__action desktop-launcher__stop"
                  icon={<ActionIcon name="stopHost" className="action-icon--only" />}
                  disabled={busy}
                  onClick={() => void stopHost()}
                >Đóng phòng</Button>
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
            >{modeTitle.host}</Button>
            <Button
              size="xl"
              variant="secondary"
              className="desktop-launcher__action"
              data-launcher-choice="join"
              icon={<ActionIcon name="join" className="action-icon--only" />}
              disabled={updateRequired}
              onClick={() => openMode('join')}
            >{modeTitle.join}</Button>
            {configuredRuntimeConfig?.socketUrl ? (
              <Button
                size="lg"
                variant="ghost"
                className="desktop-launcher__action"
                data-launcher-choice="configured"
                icon={<ActionIcon name="configuredServer" className="action-icon--only" />}
                disabled={updateRequired}
                onClick={() => openMode('configured')}
              >{modeTitle.configured}</Button>
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
                  >Cài đặt</Button>
                ) : null}
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
                  >{quitting ? 'Đang thoát…' : 'Thoát'}</Button>
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
              >Quay lại</Button>
              <h2>{modeTitle[mode]}</h2>

              <div className="desktop-launcher__field">
                <label className="entry-label" htmlFor="desktop-player-name">Tên của bạn</label>
                <input
                  id="desktop-player-name"
                  className="entry-control"
                  value={name}
                  maxLength={20}
                  placeholder="Ví dụ: Minh"
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
                      Địa chỉ đã cấu hình: <code>{configuredRuntimeConfig?.socketUrl}</code>
                    </p>
                  ) : null}
                  <div className="desktop-launcher__field">
                    <label className="entry-label" htmlFor="desktop-lan-room">Mã phòng</label>
                    <input
                      id="desktop-lan-room"
                      className="entry-control"
                      value={roomCode}
                      maxLength={20}
                      placeholder="Ví dụ: OTB-ABC234"
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
                      <label className="entry-label" htmlFor="desktop-lan-invite">Dán liên kết mời</label>
                      <input
                        id="desktop-lan-invite"
                        className="entry-control"
                        value={inviteLink}
                        placeholder="Liên kết do chủ phòng gửi"
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
                  ? 'Đang tìm phòng…'
                  : working
                    ? startingLabel(hostStatus)
                    : mode === 'host' ? 'Tạo và vào phòng' : 'Kết nối và vào phòng'}
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
        title="Đóng phòng và thoát game?"
        message="Phòng của bạn sẽ đóng lại và mọi người đang trong phòng sẽ bị ngắt kết nối."
        confirmLabel="Đóng phòng và thoát"
        confirmIcon={<ActionIcon name="leave" />}
        cancelLabel="Ở lại"
        onCancel={() => setQuitConfirmOpen(false)}
        onConfirm={() => void quitApp()}
      />
    </main>
  );
}
