import {
  cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RuntimeConfigLoadError } from '../../runtime/runtimeConfig';
import { SETTINGS_STORAGE_KEY } from '../../settings/defaults';
import { readGameSettings } from '../../settings/storage';
import { SettingsProvider } from '../../settings/SettingsProvider';
import { I18nProvider } from '../../i18n/I18n';
import { HowToPlayProvider } from '../../howToPlay/HowToPlayProvider';

const bootstrapMock = vi.hoisted(() => ({
  bootstrap: vi.fn(),
}));
const appMock = vi.hoisted(() => vi.fn());

vi.mock('./bootstrap', () => bootstrapMock);
vi.mock('../../App', () => ({ default: appMock }));

import AppBootstrap from './AppBootstrap';

function renderAppBootstrap() {
  return render(
    <SettingsProvider>
      <I18nProvider>
        <HowToPlayProvider><AppBootstrap /></HowToPlayProvider>
      </I18nProvider>
    </SettingsProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  delete window.ownTheBlockDesktop;
  vi.restoreAllMocks();
  bootstrapMock.bootstrap.mockReset();
  appMock.mockReset();
});

describe('AppBootstrap failure handling', () => {
  it('logs technical bootstrap failures while rendering safe recovery copy', async () => {
    bootstrapMock.bootstrap.mockRejectedValue(new Error('secret bridge failure'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderAppBootstrap();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Không thể khởi động trò chơi' })).toBeTruthy();
    });
    expect(screen.getByText('Không thể khởi động trò chơi. Hãy thử lại.')).toBeTruthy();
    expect(screen.queryByText('secret bridge failure')).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(
      'Own the Block bootstrap failed.',
      expect.objectContaining({ message: 'secret bridge failure' }),
    );

    bootstrapMock.bootstrap.mockResolvedValue({
      runtimeConfig: { target: 'web' },
      socket: { disconnect: vi.fn() },
      settings: {
        version: 1,
        masterVolume: 1,
        musicVolume: 0.7,
        sfxVolume: 0.8,
        animationSpeed: 1,
        reducedMotion: false,
        fullscreen: false,
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(bootstrapMock.bootstrap).toHaveBeenCalledTimes(2));
    consoleError.mockRestore();
  });

  it('shows the runtime-config safe copy for a typed local runtime failure', async () => {
    bootstrapMock.bootstrap.mockRejectedValue(
      new RuntimeConfigLoadError('SOCKET_URL_INVALID'),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderAppBootstrap();

    await waitFor(() => {
      expect(screen.getByText('Không thể chuẩn bị kết nối trò chơi. Hãy thử lại.')).toBeTruthy();
    });
    expect(screen.queryByText('SOCKET_URL_INVALID')).toBeNull();
    expect(screen.queryByText('secret main-process endpoint detail')).toBeNull();
    expect(screen.queryByText('Desktop runtime configuration could not be loaded.')).toBeNull();
  });

  it('does not create the gameplay socket before desktop endpoint selection', async () => {
    const hostStatus = {
      state: 'IDLE' as const,
      platform: 'win32' as const,
      appVersion: '3.0.0',
      gamePort: null,
      localEndpoint: null,
      lanAvailable: false,
      interfaces: [],
      advertisedEndpoints: [],
      selectedLanUrl: null,
    };
    // The Host is found from the room code alone, and only then does the gameplay socket get created.
    let finishLookup: (result: { ok: true; endpoint: string }) => void = () => undefined;
    const findRoom = vi.fn(() => new Promise<{ ok: true; endpoint: string }>(resolve => { finishLookup = resolve; }));
    const bridge = {
      getRuntimeConfig: vi.fn(() => Promise.resolve({
        ok: true as const,
        config: {
          target: 'desktop' as const,
          platform: 'win32' as const,
          appVersion: '3.0.0',
        },
      })),
      window: {
        getState: vi.fn(),
        setFullscreen: vi.fn(() => Promise.resolve()),
        toggleFullscreen: vi.fn(() => Promise.resolve()),
        onFullscreenChanged: vi.fn(() => () => undefined),
      },
      quit: {
        onQuitRequested: vi.fn(() => () => undefined),
        respond: vi.fn(),
      },
      openExternal: vi.fn(),
      host: {
        getStatus: vi.fn(() => Promise.resolve(hostStatus)),
        start: vi.fn(),
        stop: vi.fn(),
        refreshNetwork: vi.fn(() => Promise.resolve(hostStatus)),
        onStatusChanged: vi.fn(() => () => undefined),
      },
      lan: { findRoom },
    };
    window.ownTheBlockDesktop = bridge;
    bootstrapMock.bootstrap.mockResolvedValue({
      runtimeConfig: {
        target: 'desktop',
        socketUrl: 'http://192.168.1.15:8080',
        platform: 'win32',
        appVersion: '3.0.0',
      },
      socket: { disconnect: vi.fn() },
      settings: {
        version: 1,
        masterVolume: 1,
        musicVolume: 0.7,
        sfxVolume: 0.8,
        animationSpeed: 1,
        reducedMotion: false,
        fullscreen: false,
      },
    });

    renderAppBootstrap();
    expect(screen.getByRole('button', { name: 'Tham gia phòng' })).toBeTruthy();
    expect(bootstrapMock.bootstrap).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Tham gia phòng' }));
    fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Guest' } });
    expect(screen.queryByLabelText('Địa chỉ Host')).toBeNull();
    fireEvent.change(screen.getByLabelText('Mã phòng hoặc liên kết mời'), { target: { value: 'LAN-1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối và vào phòng' }));

    await waitFor(() => expect(findRoom).toHaveBeenCalledExactlyOnceWith('LAN-1234'));
    // Still searching: no gameplay socket yet.
    expect(bootstrapMock.bootstrap).not.toHaveBeenCalled();
    finishLookup({ ok: true, endpoint: 'http://192.168.1.15:8080' });

    await waitFor(() => expect(bootstrapMock.bootstrap).toHaveBeenCalledOnce());
    expect(bootstrapMock.bootstrap.mock.calls[0]?.[1]).toMatchObject({
      runtimeConfig: {
        target: 'desktop',
        socketUrl: 'http://192.168.1.15:8080',
      },
      launch: {
        initialJoin: { name: 'Guest', roomCode: 'LAN-1234' },
        targetRoomCode: 'LAN-1234',
        hosting: false,
      },
    });
  });

  it('lets the start screen change the settings and quit, with the game seeing the same settings afterwards', async () => {
    const idle = {
      state: 'IDLE' as const,
      platform: 'win32' as const,
      appVersion: '3.0.0',
      gamePort: null,
      localEndpoint: null,
      lanAvailable: false,
      interfaces: [],
      advertisedEndpoints: [],
      selectedLanUrl: null,
    };
    const exitApp = vi.fn(() => Promise.resolve());
    window.ownTheBlockDesktop = {
      getRuntimeConfig: vi.fn(() => Promise.resolve({
        ok: true as const,
        config: { target: 'desktop' as const, platform: 'win32' as const, appVersion: '3.0.0' },
      })),
      window: {
        getState: vi.fn(),
        setFullscreen: vi.fn(() => Promise.resolve()),
        toggleFullscreen: vi.fn(() => Promise.resolve()),
        onFullscreenChanged: vi.fn(() => () => undefined),
      },
      quit: { onQuitRequested: vi.fn(() => () => undefined), respond: vi.fn(), exitApp },
      openExternal: vi.fn(),
      host: {
        getStatus: vi.fn(() => Promise.resolve(idle)),
        start: vi.fn(),
        stop: vi.fn(),
        refreshNetwork: vi.fn(() => Promise.resolve(idle)),
        onStatusChanged: vi.fn(() => () => undefined),
      },
    };

    renderAppBootstrap();

    // The start screen has the button, and no gameplay socket exists yet (bootstrap has not run).
    fireEvent.click(await screen.findByRole('button', { name: 'Cài đặt' }));
    const dialog = screen.getByRole('dialog', { name: 'Cài đặt' });
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Giảm chuyển động' }));
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Thấp' }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')).toMatchObject({
      reducedMotion: true,
      graphicsQuality: 'low',
    }));
    // This is what `bootstrap()` reads when the player goes on, so the game starts with the change.
    expect(readGameSettings()).toMatchObject({ reducedMotion: true, graphicsQuality: 'low' });
    expect(bootstrapMock.bootstrap).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xong' }));

    fireEvent.click(screen.getByRole('button', { name: 'Thoát' }));
    await waitFor(() => expect(exitApp).toHaveBeenCalledOnce());
  });

  it('passes the launcher exit callback through to the desktop app', async () => {
    const bridge = {
      getRuntimeConfig: vi.fn(() => Promise.resolve({
        ok: true as const,
        config: {
          target: 'desktop' as const,
          socketUrl: 'http://192.168.1.15:8080',
          platform: 'win32' as const,
          appVersion: '3.0.0',
        },
      })),
      window: {
        onFullscreenChanged: vi.fn(() => () => undefined),
        setFullscreen: vi.fn(() => Promise.resolve()),
      },
    };
    window.ownTheBlockDesktop = bridge as never;
    appMock.mockImplementation(({ onExitToLauncher }: { onExitToLauncher?: () => void }) => (
      <button type="button" onClick={onExitToLauncher}>ready</button>
    ));
    bootstrapMock.bootstrap.mockResolvedValue({
      runtimeConfig: {
        target: 'desktop',
        socketUrl: 'http://192.168.1.15:8080',
        platform: 'win32',
        appVersion: '3.0.0',
      },
      launch: {
        runtimeConfig: {
          target: 'desktop',
          socketUrl: 'http://192.168.1.15:8080',
          platform: 'win32',
          appVersion: '3.0.0',
        },
        targetRoomCode: 'LAN-1234',
        hosting: false,
      },
      socket: { disconnect: vi.fn() },
      settings: {
        version: 1,
        masterVolume: 1,
        musicVolume: 0.7,
        sfxVolume: 0.8,
        animationSpeed: 1,
        reducedMotion: false,
        fullscreen: false,
      },
    });

    renderAppBootstrap();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Máy chủ riêng' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Máy chủ riêng' }));
    fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Mã phòng'), { target: { value: 'LAN-1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối và vào phòng' }));
    await waitFor(() => expect(bootstrapMock.bootstrap).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole('button', { name: 'ready' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'ready' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Máy chủ riêng' })).toBeTruthy());
  });
});
