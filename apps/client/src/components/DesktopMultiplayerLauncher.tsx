import { useEffect, useState } from 'react';
import {
  ArrowLeft, LogIn, Play, Plug, Server, Square,
} from 'lucide-react';
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
import './style/DesktopMultiplayerLauncher.css';

type LauncherMode = 'host' | 'join' | 'configured' | null;

interface DesktopMultiplayerLauncherProps {
  configuredRuntimeConfig?: RuntimeConfig;
  configurationError?: string | null;
  onReady: (selection: DesktopLaunchSelection) => void;
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
}: DesktopMultiplayerLauncherProps) {
  const bridge = getDesktopBridge();
  const [mode, setMode] = useState<LauncherMode>(null);
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

  return (
    <main className="desktop-launcher" aria-labelledby="desktop-launcher-title">
      <section className="desktop-launcher__card">
        <p className="desktop-launcher__brand" aria-hidden="true">OWN THE BLOCK</p>
        <h1 id="desktop-launcher-title">Cờ Tỷ Phú Việt Nam</h1>
        <p className="desktop-launcher__subtitle">Một máy Host giữ phòng; các thiết bị cùng Wi-Fi hoặc Ethernet tham gia bằng địa chỉ LAN.</p>

        {error ? <p className="desktop-launcher__error" role="alert">{error}</p> : null}
        {hostStarting ? <p className="desktop-launcher__status" role="status">{startingLabel(hostStatus)}</p> : null}

        {mode === null ? (
          <div className="desktop-launcher__choices">
            {hostStatus?.state === 'HOSTING' && hostStatus.localEndpoint ? (
              <div className="desktop-launcher__running">
                <button type="button" onClick={() => onReady({
                  runtimeConfig: runtimeConfig(hostStatus.localEndpoint as string, hostStatus),
                  hosting: true,
                })}>
                  <strong><Play className="action-icon" aria-hidden="true" />Tiếp tục Host đang chạy</strong>
                  <span>Máy chủ LAN vẫn giữ dữ liệu phòng trên máy này.</span>
                </button>
                <button type="button" className="desktop-launcher__stop" disabled={busy} onClick={() => void stopHost()}>
                  <Square className="action-icon" aria-hidden="true" />Dừng Host
                </button>
              </div>
            ) : null}
            <button type="button" onClick={() => { setMode('host'); setError(null); }}>
              <strong><Server className="action-icon" aria-hidden="true" />Host Game</strong>
              <span>Khởi động máy chủ riêng trên máy này.</span>
            </button>
            <button type="button" onClick={() => { setMode('join'); setError(null); }}>
              <strong><LogIn className="action-icon" aria-hidden="true" />Join Game</strong>
              <span>Nhập địa chỉ IPv4 và mã phòng do Host chia sẻ.</span>
            </button>
            {configuredRuntimeConfig?.socketUrl ? (
              <button type="button" onClick={() => { setMode('configured'); setError(null); }}>
                <strong><Plug className="action-icon" aria-hidden="true" />Máy chủ đã cấu hình</strong>
                <span>Dùng địa chỉ thử nghiệm hoặc máy chủ cũ đã cung cấp.</span>
              </button>
            ) : null}
          </div>
        ) : (
          <form className="desktop-launcher__form" onSubmit={event => {
            event.preventDefault();
            void (mode === 'host' ? startHost() : joinHost());
          }}>
            <button className="desktop-launcher__back" type="button" onClick={() => setMode(null)}>
              <ArrowLeft className="action-icon" aria-hidden="true" />Chọn lại chế độ
            </button>
            <h2>{mode === 'host' ? 'Host Game' : 'Join Game'}</h2>

            <label htmlFor="desktop-player-name">Tên của bạn</label>
            <input
              id="desktop-player-name"
              value={name}
              maxLength={20}
              onChange={event => setName(event.target.value)}
              autoFocus
              autoComplete="nickname"
            />

            {mode === 'host' ? (
              <>
                {hostStatus?.interfaces.length ? (
                  <>
                    <label htmlFor="desktop-lan-interface">Mạng dùng để chia sẻ</label>
                    <select
                      id="desktop-lan-interface"
                      value={preferredAddress}
                      onChange={event => setPreferredAddress(event.target.value)}
                    >
                      {hostStatus.interfaces.map(candidate => (
                        <option key={candidate.address} value={candidate.address}>
                          {candidate.displayName} — {candidate.address}
                        </option>
                      ))}
                    </select>
                  </>
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
                  <>
                    <label htmlFor="desktop-lan-address">Địa chỉ Host</label>
                    <input
                      id="desktop-lan-address"
                      value={address}
                      placeholder="192.168.1.25:53120"
                      inputMode="url"
                      autoCapitalize="none"
                      spellCheck={false}
                      onChange={event => { setAddress(event.target.value); setError(null); }}
                    />
                  </>
                )}
                <label htmlFor="desktop-lan-room">Mã phòng</label>
                <input
                  id="desktop-lan-room"
                  value={roomCode}
                  maxLength={20}
                  autoCapitalize="characters"
                  onChange={event => setRoomCode(event.target.value.toUpperCase())}
                />
                <p className="desktop-launcher__hint">
                  Nếu không kết nối được, xác nhận hai thiết bị cùng LAN; tường lửa, mạng khách hoặc VPN có thể chặn kết nối.
                </p>
              </>
            )}

            <button
              className="desktop-launcher__submit"
              type="submit"
              disabled={busy || hostStarting || !name.trim()
                || (mode === 'host' ? !preferredAddress : !roomCode.trim())}
            >
              {mode === 'host'
                ? <Server className="action-icon" aria-hidden="true" />
                : <LogIn className="action-icon" aria-hidden="true" />}
              {busy || hostStarting
                ? startingLabel(hostStatus)
                : mode === 'host' ? 'Tạo và vào phòng' : 'Kết nối và vào phòng'}
            </button>
          </form>
        )}
        <p className="desktop-launcher__security">Liên kết mời chỉ chứa địa chỉ LAN và mã phòng; không chứa phiên kết nối hay thông tin cơ sở dữ liệu.</p>
      </section>
    </main>
  );
}
