import { useEffect, useMemo, useState } from 'react';
import { getDesktopBridge } from '../runtime/desktopBridge';
import { normalizeLanEndpoint } from '../runtime/lanEndpoint';
import type {
  DesktopLaunchSelection,
  DesktopPlatform,
  DiscoveredLanGame,
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
  POSTGRES_INITIALIZATION_FAILED: 'Không thể khởi tạo cơ sở dữ liệu cục bộ.',
  MIGRATION_FAILED: 'Không thể cập nhật dữ liệu trò chơi cục bộ.',
  HELPER_FAILED: 'Không thể khởi động máy chủ trò chơi cục bộ.',
  READINESS_TIMEOUT: 'Máy chủ cục bộ không sẵn sàng kịp thời.',
  PORT_OCCUPIED: 'Cổng trò chơi đang được dùng. Hãy chọn cổng khác.',
  BIND_DENIED: 'Hệ điều hành từ chối mở cổng trò chơi. Hãy kiểm tra quyền và tường lửa.',
  NO_LAN_INTERFACE: 'Không tìm thấy địa chỉ IPv4 riêng để chia sẻ trong mạng LAN.',
  RUNTIME_FAILED: 'Không thể chuẩn bị máy chủ LAN.',
};

function randomRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return `LAN-${[...bytes].map(byte => alphabet[byte % alphabet.length]).join('')}`;
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

function statusError(status?: HostRuntimeStatus): string {
  return status?.errorCode ? hostErrorCopy[status.errorCode] : 'Không thể chuẩn bị máy chủ LAN.';
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
  const [port, setPort] = useState('8080');
  const [games, setGames] = useState<DiscoveredLanGame[]>([]);
  const [hostStatus, setHostStatus] = useState<HostRuntimeStatus | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(configurationError ?? null);

  useEffect(() => {
    if (!bridge?.host) return undefined;
    let active = true;
    void bridge.host.getStatus().then(status => {
      if (active) setHostStatus(status);
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [bridge]);

  useEffect(() => {
    if (configurationError) setError(configurationError);
  }, [configurationError]);

  const selectedGame = useMemo(
    () => games.find(game => game.endpoints.includes(normalizeLanEndpoint(address) ?? '')),
    [address, games],
  );

  useEffect(() => {
    if (mode !== 'join') return undefined;
    if (!bridge?.discovery) {
      setError('Tự động tìm máy chủ không khả dụng. Hãy nhập địa chỉ LAN thủ công.');
      return undefined;
    }
    let active = true;
    const load = async (): Promise<void> => {
      const status = await bridge.host?.getStatus().catch(() => undefined);
      if (active && status) setHostStatus(status);
      const result = await bridge.discovery?.startBrowsing();
      if (!active) return;
      if (result && !result.ok) setError('Không thể tìm máy chủ tự động. Hãy nhập địa chỉ LAN thủ công.');
      const currentGames = await bridge.discovery?.getGames();
      if (active && currentGames) setGames(currentGames);
    };
    const removeListener = bridge.discovery.onGamesChanged(nextGames => {
      if (active) setGames(nextGames);
    });
    void load().catch(() => {
      if (active) setError('Không thể tìm máy chủ tự động. Hãy nhập địa chỉ LAN thủ công.');
    });
    return () => {
      active = false;
      removeListener();
      void bridge.discovery?.stopBrowsing();
    };
  }, [bridge, mode]);

  const chooseGame = (game: DiscoveredLanGame): void => {
    const endpoint = game.endpoints[0];
    if (!endpoint) return;
    setAddress(endpoint);
    setRoomCode(game.roomCode);
    setError(null);
  };

  const startHost = async (): Promise<void> => {
    if (!bridge?.host || !name.trim()) return;
    const selectedPort = Number(port);
    if (!Number.isSafeInteger(selectedPort) || selectedPort < 1 || selectedPort > 65_535) {
      setError('Cổng trò chơi phải là số từ 1 đến 65535.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await bridge.host.start({ port: selectedPort });
      setHostStatus(result.status);
      if (!result.ok || !result.status.localEndpoint) {
        setError(statusError(result.status));
        return;
      }
      if (!result.status.lanAvailable) {
        setError(hostErrorCopy.NO_LAN_INTERFACE);
        await bridge.host.stop();
        return;
      }
      const nextRoomCode = randomRoomCode();
      onReady({
        runtimeConfig: runtimeConfig(result.status.localEndpoint, result.status),
        initialJoin: { name: name.trim(), roomCode: nextRoomCode },
        hosting: true,
      });
    } catch {
      setError(statusError(hostStatus));
    } finally {
      setBusy(false);
    }
  };

  const joinHost = (): void => {
    if (!name.trim() || !roomCode.trim()) return;
    const endpoint = mode === 'configured'
      ? configuredRuntimeConfig?.socketUrl
      : normalizeLanEndpoint(address);
    if (!endpoint) {
      setError('Nhập địa chỉ IPv4 riêng dạng 192.168.1.15:8080.');
      return;
    }
    onReady({
      runtimeConfig: runtimeConfig(endpoint, hostStatus ?? undefined),
      initialJoin: { name: name.trim(), roomCode: roomCode.trim().toUpperCase() },
      hosting: false,
    });
  };

  if (!bridge) return null;

  return (
    <main className="desktop-launcher" aria-labelledby="desktop-launcher-title">
      <section className="desktop-launcher__card">
        <p className="desktop-launcher__brand" aria-hidden="true">OWN THE BLOCK</p>
        <h1 id="desktop-launcher-title">Cờ Tỷ Phú Việt Nam</h1>
        <p className="desktop-launcher__subtitle">Chơi cùng người khác trong cùng mạng Wi-Fi hoặc Ethernet.</p>

        {error ? <p className="desktop-launcher__error" role="alert">{error}</p> : null}

        {mode === null ? (
          <div className="desktop-launcher__choices">
            {hostStatus?.state === 'HOSTING' && hostStatus.localEndpoint ? (
              <button type="button" onClick={() => onReady({
                runtimeConfig: runtimeConfig(hostStatus.localEndpoint as string, hostStatus),
                hosting: true,
              })}>
                <strong>Tiếp tục phòng đang chạy</strong>
                <span>Máy chủ LAN vẫn đang hoạt động trên máy này.</span>
              </button>
            ) : null}
            <button type="button" onClick={() => { setMode('host'); setError(null); }}>
              <strong>Tạo phòng LAN</strong>
              <span>Máy này chạy máy chủ authoritative.</span>
            </button>
            <button type="button" onClick={() => { setMode('join'); setError(null); }}>
              <strong>Tham gia phòng LAN</strong>
              <span>Tìm máy chủ hoặc nhập địa chỉ thủ công.</span>
            </button>
            {configuredRuntimeConfig ? (
              <button type="button" onClick={() => { setMode('configured'); setError(null); }}>
                <strong>Máy chủ đã cấu hình</strong>
                <span>Kết nối tới endpoint đã được cung cấp.</span>
              </button>
            ) : null}
          </div>
        ) : (
          <form className="desktop-launcher__form" onSubmit={event => { event.preventDefault(); void (mode === 'host' ? startHost() : joinHost()); }}>
            <button className="desktop-launcher__back" type="button" onClick={() => setMode(null)}>
              ← Chọn lại chế độ
            </button>
            <h2>{mode === 'host' ? 'Tạo phòng LAN' : mode === 'configured' ? 'Kết nối máy chủ' : 'Tham gia phòng LAN'}</h2>

            <label htmlFor="desktop-player-name">Tên của bạn</label>
            <input
              id="desktop-player-name"
              value={name}
              maxLength={20}
              onChange={event => setName(event.target.value)}
              autoFocus
            />

            {mode === 'host' ? (
              <>
                <label htmlFor="desktop-game-port">Cổng trò chơi</label>
                <input
                  id="desktop-game-port"
                  type="number"
                  min="1"
                  max="65535"
                  value={port}
                  onChange={event => setPort(event.target.value)}
                />
                <p className="desktop-launcher__hint">Mặc định 8080. Không tự đổi cổng khi cổng này đang bận.</p>
              </>
            ) : mode === 'configured' ? null : (
              <>
                <label htmlFor="desktop-lan-address">Địa chỉ máy chủ LAN</label>
                <input
                  id="desktop-lan-address"
                  value={address}
                  placeholder="192.168.1.15:8080"
                  onChange={event => { setAddress(event.target.value); setError(null); }}
                />
                <label htmlFor="desktop-lan-room">Mã phòng</label>
                <input
                  id="desktop-lan-room"
                  value={roomCode}
                  maxLength={20}
                  onChange={event => setRoomCode(event.target.value.toUpperCase())}
                />
                <div className="desktop-launcher__discoveries" aria-live="polite">
                  <h3>Máy chủ được tìm thấy</h3>
                  {games.length === 0 ? <p>Chưa tìm thấy máy chủ. Bạn vẫn có thể nhập địa chỉ thủ công.</p> : null}
                  {games.map(game => (
                    <button
                      key={game.gameId}
                      type="button"
                      className={selectedGame?.gameId === game.gameId ? 'is-selected' : ''}
                      onClick={() => chooseGame(game)}
                    >
                      <strong>Phòng {game.roomCode}</strong>
                      <span>{game.endpoints[0]} · Own the Block {game.appVersion}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <button className="desktop-launcher__submit" type="submit" disabled={busy || !name.trim() || (mode !== 'host' && !roomCode.trim())}>
              {busy ? 'Đang chuẩn bị…' : mode === 'host' ? 'Tạo và vào phòng' : 'Kết nối và vào phòng'}
            </button>
          </form>
        )}
        <p className="desktop-launcher__security">Mã phòng chỉ là thông tin vào phòng, không phải mật khẩu. Không chia sẻ thông tin cơ sở dữ liệu.</p>
      </section>
    </main>
  );
}
