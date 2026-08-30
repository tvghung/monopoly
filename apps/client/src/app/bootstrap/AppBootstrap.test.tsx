import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RuntimeConfigLoadError } from '../../runtime/runtimeConfig';

const bootstrapMock = vi.hoisted(() => ({
  bootstrap: vi.fn(),
}));

vi.mock('./bootstrap', () => bootstrapMock);
vi.mock('../../App', () => ({ default: () => <p>ready</p> }));

import AppBootstrap from './AppBootstrap';

afterEach(() => {
  cleanup();
  delete window.ownTheBlockDesktop;
  vi.restoreAllMocks();
  bootstrapMock.bootstrap.mockReset();
});

describe('AppBootstrap failure handling', () => {
  it('logs technical bootstrap failures while rendering safe recovery copy', async () => {
    bootstrapMock.bootstrap.mockRejectedValue(new Error('secret bridge failure'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<AppBootstrap />);

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
      new RuntimeConfigLoadError('PACKAGED_SOCKET_URL_MISSING'),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<AppBootstrap />);

    await waitFor(() => {
      expect(screen.getByText('Không thể chuẩn bị kết nối trò chơi. Hãy thử lại.')).toBeTruthy();
    });
    expect(screen.queryByText('PACKAGED_SOCKET_URL_MISSING')).toBeNull();
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
    };
    const bridge = {
      getRuntimeConfig: vi.fn(() => Promise.resolve({ ok: false as const, code: 'PACKAGED_SOCKET_URL_MISSING' as const })),
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
        onStatusChanged: vi.fn(() => () => undefined),
      },
      lan: { getInterfaces: vi.fn(() => Promise.resolve([])) },
      discovery: {
        startBrowsing: vi.fn(() => Promise.resolve({ ok: true as const })),
        stopBrowsing: vi.fn(() => Promise.resolve()),
        getGames: vi.fn(() => Promise.resolve([])),
        onGamesChanged: vi.fn(() => () => undefined),
        startAdvertising: vi.fn(() => Promise.resolve({ ok: true as const })),
        stopAdvertising: vi.fn(() => Promise.resolve()),
      },
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

    render(<AppBootstrap />);
    expect(screen.getByRole('button', { name: /Tham gia phòng LAN/u })).toBeTruthy();
    expect(bootstrapMock.bootstrap).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Tham gia phòng LAN/u }));
    fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Guest' } });
    fireEvent.change(screen.getByLabelText('Địa chỉ máy chủ LAN'), { target: { value: '192.168.1.15:8080' } });
    fireEvent.change(screen.getByLabelText('Mã phòng'), { target: { value: 'LAN-1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối và vào phòng' }));

    await waitFor(() => expect(bootstrapMock.bootstrap).toHaveBeenCalledOnce());
    expect(bootstrapMock.bootstrap.mock.calls[0]?.[1]).toMatchObject({
      runtimeConfig: {
        target: 'desktop',
        socketUrl: 'http://192.168.1.15:8080',
      },
      launch: {
        initialJoin: { name: 'Guest', roomCode: 'LAN-1234' },
        hosting: false,
      },
    });
  });
});
