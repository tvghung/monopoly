import { useEffect, useState } from 'react';
import Button from '../design-system/components/Button/Button';
import Panel from '../design-system/components/Panel/Panel';
import { ActionIcon } from '../design-system/icons/ActionIcon';
import type { ActionIconName } from '../design-system/icons/actionIcons';
import { getDesktopBridge } from '../runtime/desktopBridge';
import { normalizeLanEndpoint } from '../runtime/lanEndpoint';
import { generateHostRoomCode, normalizeRoomCode } from '../runtime/lanSharing';
import type {
  DesktopLaunchSelection,
  DesktopPlatform,
  HostRuntimeErrorCode,
  HostRuntimeStatus,
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
}

const modeTitle: Record<Exclude<LauncherMode, null>, string> = {
  host: 'Tạo phòng trên máy này',
  join: 'Tham gia phòng LAN',
  configured: 'Máy chủ đã cấu hình',
};

interface ChoiceCardProps {
  icon: ActionIconName;
  title: string;
  description: string;
  className?: string;
  onClick: () => void;
}

/** One way to start: a large target with a glyph, what it does, and a line on what it needs. */
function ChoiceCard({
  icon, title, description, className = '', onClick,
}: ChoiceCardProps) {
  return (
    <button
      type="button"
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

const hostErrorCopy: Record<HostRuntimeErrorCode, string> = {
  POSTGRES_RESOURCES_MISSING: 'Không tìm thấy tài nguyên máy chủ cục bộ. Hãy cài lại ứng dụng rồi thử lại.',
  POSTGRES_INITIALIZATION_FAILED: 'Không thể khởi động cơ sở dữ liệu đã lưu. Dữ liệu không bị đặt lại.',
  MIGRATION_FAILED: 'Không thể cập nhật dữ liệu trò chơi cục bộ.',
  HELPER_FAILED: 'Máy chủ trò chơi cục bộ đã dừng. Hãy thử khởi động lại Host.',
  READINESS_TIMEOUT: 'Máy chủ cục bộ không sẵn sàng kịp thời.',
  PORT_OCCUPIED: 'Cổng trò chơi đang được dùng. Hãy thử lại để chọn cổng tự động khác.',
  BIND_DENIED: 'Hệ điều hành từ chối mở cổng trò chơi. Hãy kiểm tra quyền và tường lửa.',
  NO_LAN_INTERFACE: 'Không tìm thấy địa chỉ IPv4 LAN dùng được. Hãy kiểm tra Wi-Fi, Ethernet hoặc VPN.',
  RUNTIME_FAILED: 'Không thể chuẩn bị máy chủ LAN.',
};

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
  return status?.errorCode ? hostErrorCopy[status.errorCode] : 'Không thể chuẩn bị máy chủ LAN.';
}

function startingLabel(status?: HostRuntimeStatus): string {
  if (status?.state === 'STARTING_POSTGRES') return 'Đang khởi động cơ sở dữ liệu…';
  if (status?.state === 'STARTING_SERVER') return 'Đang khởi động máy chủ trò chơi…';
  if (status?.state === 'STOPPING') return 'Đang dừng máy chủ…';
  return 'Đang chuẩn bị…';
}

export default function DesktopMultiplayerLauncher({
  configuredRuntimeConfig,
  configurationError,
  onReady,
  initialMode,
}: DesktopMultiplayerLauncherProps) {
  const bridge = getDesktopBridge();
  const [mode, setMode] = useState<LauncherMode>(initialMode ?? null);
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [address, setAddress] = useState('');
  const [preferredAddress, setPreferredAddress] = useState('');
  const [hostStatus, setHostStatus] = useState<HostRuntimeStatus | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(configurationError ?? null);

  useEffect(() => {
    if (!bridge?.host) return undefined;
    let active = true;
    void bridge.host.getStatus().then(status => {
      if (active) {
        setHostStatus(status);
        setPreferredAddress(status.interfaces[0]?.address ?? '');
      }
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

  useEffect(() => {
    if (mode !== 'host' || !bridge?.host) return;
    void bridge.host.refreshNetwork().then(status => {
      setHostStatus(status);
      setPreferredAddress(current => (
        status.interfaces.some(candidate => candidate.address === current)
          ? current
          : status.interfaces[0]?.address ?? ''
      ));
    }).catch(() => setError(hostErrorCopy.NO_LAN_INTERFACE));
  }, [bridge, mode]);

  const startHost = async (): Promise<void> => {
    if (!bridge?.host || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await bridge.host.start({
        ...(preferredAddress ? { preferredAddress } : {}),
      });
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

  const joinHost = (): void => {
    if (!name.trim()) return;
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    if (!normalizedRoomCode) {
      setError('Mã phòng phải có 1–20 ký tự chữ, số hoặc dấu gạch ngang.');
      return;
    }
    const endpoint = mode === 'configured'
      ? configuredRuntimeConfig?.socketUrl
      : normalizeLanEndpoint(address);
    if (!endpoint) {
      setError(mode === 'configured'
        ? 'Địa chỉ máy chủ đã cấu hình không khả dụng.'
        : 'Nhập IPv4 và cổng, ví dụ 192.168.1.25:53120.');
      return;
    }
    onReady({
      runtimeConfig: mode === 'configured'
        ? {
          target: 'desktop',
          socketUrl: endpoint,
          platform: configuredRuntimeConfig?.platform ?? fallbackPlatform(),
          appVersion: configuredRuntimeConfig?.appVersion ?? 'unknown',
        }
        : runtimeConfig(endpoint, hostStatus),
      initialJoin: { name: name.trim(), roomCode: normalizedRoomCode },
      targetRoomCode: normalizedRoomCode,
      hosting: false,
    });
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
  const working = busy || hostStarting;
  // The written reason the submit button is disabled; starting and the missing-network case say so in their own lines.
  const submitReason = !name.trim()
    ? 'Nhập tên của bạn để tiếp tục.'
    : mode !== 'host' && !roomCode.trim() ? 'Nhập mã phòng do Host chia sẻ.' : null;

  return (
    <main className="desktop-launcher" aria-labelledby="desktop-launcher-title">
      <Panel as="section" padding="lg" className="desktop-launcher__card">
        <header className="desktop-launcher__header">
          <p className="desktop-launcher__brand" aria-hidden="true">OWN THE BLOCK</p>
          <h1 id="desktop-launcher-title">Chơi qua mạng LAN</h1>
          <p className="desktop-launcher__subtitle">Một máy Host giữ phòng; các thiết bị cùng Wi-Fi hoặc Ethernet tham gia bằng địa chỉ LAN.</p>
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
                  description="Máy chủ LAN vẫn giữ dữ liệu phòng trên máy này"
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
              title={modeTitle.host}
              description="Máy này làm chủ phòng, người khác vào qua Wi-Fi"
              onClick={() => { setMode('host'); setError(null); }}
            />
            <ChoiceCard
              icon="join"
              title={modeTitle.join}
              description="Nhập địa chỉ IPv4 và mã phòng do Host chia sẻ"
              onClick={() => { setMode('join'); setError(null); }}
            />
            {configuredRuntimeConfig?.socketUrl ? (
              <ChoiceCard
                icon="configuredServer"
                title={modeTitle.configured}
                description="Dùng địa chỉ thử nghiệm hoặc máy chủ cũ đã cung cấp"
                onClick={() => { setMode('configured'); setError(null); }}
              />
            ) : null}
          </div>
        ) : (
          <form className="desktop-launcher__form" onSubmit={event => {
            event.preventDefault();
            void (mode === 'host' ? startHost() : joinHost());
          }}>
            <Button
              variant="ghost"
              className="desktop-launcher__back"
              icon={<ActionIcon name="back" className="action-icon--only" />}
              onClick={() => setMode(null)}
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
                onChange={event => setName(event.target.value)}
                autoFocus
                autoComplete="nickname"
              />
            </div>

            {mode === 'host' ? (
              <>
                {hostStatus?.interfaces.length ? (
                  <div className="desktop-launcher__field">
                    <label className="entry-label" htmlFor="desktop-lan-interface">Mạng dùng để chia sẻ</label>
                    <select
                      id="desktop-lan-interface"
                      className="entry-control"
                      value={preferredAddress}
                      onChange={event => setPreferredAddress(event.target.value)}
                    >
                      {hostStatus.interfaces.map(candidate => (
                        <option key={candidate.address} value={candidate.address}>
                          {candidate.displayName} — {candidate.address}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="desktop-launcher__hint">Chưa tìm thấy IPv4 LAN dùng được.</p>
                )}
                <p className="desktop-launcher__hint">Cổng được hệ điều hành chọn an toàn và sẽ hiện trong liên kết mời.</p>
              </>
            ) : (
              <>
                {mode === 'configured' ? (
                  <p className="desktop-launcher__endpoint" role="note">
                    Địa chỉ đã cấu hình: <code>{configuredRuntimeConfig?.socketUrl}</code>
                  </p>
                ) : (
                  <div className="desktop-launcher__field">
                    <label className="entry-label" htmlFor="desktop-lan-address">Địa chỉ Host</label>
                    <input
                      id="desktop-lan-address"
                      className="entry-control"
                      value={address}
                      placeholder="192.168.1.25:53120"
                      inputMode="url"
                      autoCapitalize="none"
                      spellCheck={false}
                      onChange={event => { setAddress(event.target.value); setError(null); }}
                    />
                  </div>
                )}
                <div className="desktop-launcher__field">
                  <label className="entry-label" htmlFor="desktop-lan-room">Mã phòng</label>
                  <input
                    id="desktop-lan-room"
                    className="entry-control"
                    value={roomCode}
                    maxLength={20}
                    placeholder="Ví dụ: OTB-ABC234"
                    autoCapitalize="characters"
                    onChange={event => setRoomCode(event.target.value.toUpperCase())}
                  />
                </div>
                <p className="desktop-launcher__hint">
                  Nếu không kết nối được, xác nhận hai thiết bị cùng LAN; tường lửa, mạng khách hoặc VPN có thể chặn kết nối.
                </p>
              </>
            )}

            <Button
              type="submit"
              size="lg"
              className="desktop-launcher__submit"
              icon={working ? undefined : <ActionIcon name={mode === 'host' ? 'host' : 'join'} className="action-icon--only" />}
              busy={working}
              disabled={!name.trim() || (mode === 'host' ? !preferredAddress : !roomCode.trim())}
              aria-describedby={submitReason && !working ? 'desktop-submit-reason' : undefined}
            >
              {working
                ? startingLabel(hostStatus)
                : mode === 'host' ? 'Tạo và vào phòng' : 'Kết nối và vào phòng'}
            </Button>
            {submitReason && !working ? (
              <p id="desktop-submit-reason" className="desktop-launcher__hint desktop-launcher__reason">{submitReason}</p>
            ) : null}
          </form>
        )}
        <p className="desktop-launcher__security">Liên kết mời chỉ chứa địa chỉ LAN và mã phòng; không chứa phiên kết nối hay thông tin cơ sở dữ liệu.</p>
      </Panel>
    </main>
  );
}
