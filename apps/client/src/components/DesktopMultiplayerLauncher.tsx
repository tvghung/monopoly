import { useEffect, useRef, useState } from 'react';
import Button from '../design-system/components/Button/Button';
import Panel from '../design-system/components/Panel/Panel';
import { ActionIcon } from '../design-system/icons/ActionIcon';
import type { ActionIconName } from '../design-system/icons/actionIcons';
import { HowToPlayButton } from '../howToPlay';
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
  host: 'Tạo phòng trên máy này',
  join: 'Tham gia phòng LAN',
  configured: 'Máy chủ đã cấu hình',
};

interface ChoiceCardProps {
  icon: ActionIconName;
  /** Which form the card opens; the back button uses it to return focus here. */
  choice?: Exclude<LauncherMode, null>;
  title: string;
  description: string;
  className?: string;
  onClick: () => void;
}

/** One way to start: a large target with a glyph, what it does, and a line on what it needs. */
function ChoiceCard({
  icon, choice, title, description, className = '', onClick,
}: ChoiceCardProps) {
  return (
    <button
      type="button"
      data-launcher-choice={choice}
      className={`desktop-launcher__choice${className ? ` ${className}` : ''}`}
      onClick={onClick}
    >
      <span className="desktop-launcher__choice-icon" aria-hidden="true">
        <ActionIcon name={icon} className="action-icon--only" />
      </span>
      <span className="desktop-launcher__choice-title">{title}</span>
      <span className="desktop-launcher__choice-text">{description}</span>
    </button>
  );
}

const NO_NETWORK_COPY = 'Máy này chưa kết nối mạng. Hãy bật Wi-Fi hoặc cắm dây mạng.';

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

export default function DesktopMultiplayerLauncher({
  configuredRuntimeConfig,
  configurationError,
  onReady,
  initialMode,
  initialJoin,
}: DesktopMultiplayerLauncherProps) {
  const bridge = getDesktopBridge();
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

  // Leaving a form with "Chọn lại chế độ" removes the focused button: put the focus on the card that opened the form.
  useEffect(() => {
    if (mode !== null || !returnFocusRef.current) return;
    const choice = returnFocusRef.current;
    returnFocusRef.current = null;
    rootRef.current?.querySelector<HTMLElement>(`[data-launcher-choice="${choice}"]`)?.focus();
  }, [mode]);

  // A search that is still running when the launcher goes away must not launch anything.
  useEffect(() => () => { searchRef.current += 1; }, []);

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

  if (!bridge) return null;
  const hostStarting = hostStatus?.state === 'STARTING_POSTGRES'
    || hostStatus?.state === 'STARTING_SERVER'
    || hostStatus?.state === 'STOPPING';
  const working = busy || hostStarting || searching;
  // The written reason the submit button is disabled; starting says so in its own line.
  const submitReason = !name.trim()
    ? 'Nhập tên của bạn để tiếp tục.'
    : mode !== 'host' && !roomCode.trim() ? 'Nhập mã phòng do chủ phòng chia sẻ.' : null;

  return (
    <main ref={rootRef} className="desktop-launcher" aria-labelledby="desktop-launcher-title">
      <Panel as="section" padding="lg" className="desktop-launcher__card">
        <header className="desktop-launcher__header">
          <p className="desktop-launcher__brand" aria-hidden="true">OWN THE BLOCK</p>
          <h1 id="desktop-launcher-title">Chơi qua mạng LAN</h1>
          <HowToPlayButton variant="labelled" className="desktop-launcher__help" />
        </header>

        {error ? <p className="desktop-launcher__error" role="alert">{error}</p> : null}
        {hostStarting ? <p className="desktop-launcher__status" role="status">{startingLabel(hostStatus)}</p> : null}

        {mode === null ? (
          <div className="desktop-launcher__choices">
            {hostStatus?.state === 'HOSTING' && hostStatus.localEndpoint ? (
              <div className="desktop-launcher__running">
                <ChoiceCard
                  icon="start"
                  title="Tiếp tục Host đang chạy"
                  description="Phòng của bạn vẫn được giữ trên máy này"
                  className="desktop-launcher__choice--running"
                  onClick={() => onReady({
                    runtimeConfig: runtimeConfig(hostStatus.localEndpoint as string, hostStatus),
                    hosting: true,
                  })}
                />
                <Button
                  variant="ghost"
                  className="desktop-launcher__stop"
                  icon={<ActionIcon name="stopHost" className="action-icon--only" />}
                  disabled={busy}
                  onClick={() => void stopHost()}
                >Dừng Host</Button>
              </div>
            ) : null}
            <ChoiceCard
              icon="host"
              choice="host"
              title={modeTitle.host}
              description="Máy này làm chủ phòng, bạn bè vào bằng mã phòng"
              onClick={() => openMode('host')}
            />
            <ChoiceCard
              icon="join"
              choice="join"
              title={modeTitle.join}
              description="Nhập mã phòng để vào chơi"
              onClick={() => openMode('join')}
            />
            {configuredRuntimeConfig?.socketUrl ? (
              <ChoiceCard
                icon="configuredServer"
                choice="configured"
                title={modeTitle.configured}
                description="Dùng địa chỉ thử nghiệm hoặc máy chủ cũ đã cung cấp"
                onClick={() => openMode('configured')}
              />
            ) : null}
          </div>
        ) : (
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
            >Chọn lại chế độ</Button>
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
        )}
      </Panel>
    </main>
  );
}
