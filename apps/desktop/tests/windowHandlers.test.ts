import { afterEach, describe, expect, it, vi } from 'vitest';

type IpcHandler = (event: { sender: object }, ...args: unknown[]) => unknown;

const harness = vi.hoisted(() => ({
  handlers: new Map<string, IpcHandler>(),
  getDesktopRuntimeConfig: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getVersion: vi.fn(() => '1.0.0'),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      harness.handlers.set(channel, handler);
    }),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  shell: { openExternal: vi.fn() },
}));

vi.mock('../src/runtimeConfig', async importOriginal => ({
  ...(await importOriginal<typeof import('../src/runtimeConfig')>()),
  getDesktopRuntimeConfig: harness.getDesktopRuntimeConfig,
}));

import { IPC_CHANNELS } from '../src/ipc/channels';
import { QuitRequestController, registerWindowHandlers } from '../src/ipc/windowHandlers';
import { DesktopRuntimeConfigError } from '../src/runtimeConfig';
import type { HostRuntimeStatus } from '../src/hostRuntime';
import type { DiscoveredLanGame } from '../src/lanDiscovery';

afterEach(() => {
  vi.useRealTimers();
  harness.handlers.clear();
  harness.getDesktopRuntimeConfig.mockReset();
  vi.restoreAllMocks();
});

describe('runtime config IPC lifecycle', () => {
  function registerRuntimeConfigHandler() {
    const webContents = { send: vi.fn() };
    const window = {
      webContents,
      close: vi.fn(),
      isDestroyed: () => false,
      isFullScreen: () => false,
      isMaximized: () => false,
      isResizable: () => true,
      setFullScreen: vi.fn(),
      on: vi.fn(),
    };
    const quitController = new QuitRequestController(window as never);

    registerWindowHandlers(window as never, false, quitController);

    const runtimeConfigHandler = harness.handlers.get(IPC_CHANNELS.runtimeConfig);
    expect(runtimeConfigHandler).toBeDefined();
    return { runtimeConfigHandler: runtimeConfigHandler!, webContents, window };
  }

  it('returns a structured failure for a missing packaged endpoint', async () => {
    const error = new DesktopRuntimeConfigError(
      'PACKAGED_SOCKET_URL_MISSING',
      'secret main-process endpoint detail',
    );
    harness.getDesktopRuntimeConfig.mockImplementation(() => { throw error; });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { runtimeConfigHandler, window, webContents } = registerRuntimeConfigHandler();

    expect(runtimeConfigHandler({ sender: webContents })).toEqual({
      ok: false,
      code: 'PACKAGED_SOCKET_URL_MISSING',
    });
    expect(consoleError).toHaveBeenCalledWith(
      'Desktop runtime configuration is unavailable.',
      error,
    );
    expect(window.close).not.toHaveBeenCalled();
  });

  it('returns a structured failure for an invalid endpoint', async () => {
    harness.getDesktopRuntimeConfig.mockImplementation(() => {
      throw new DesktopRuntimeConfigError('SOCKET_URL_INVALID', 'secret invalid endpoint detail');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { runtimeConfigHandler, webContents } = registerRuntimeConfigHandler();

    expect(runtimeConfigHandler({ sender: webContents })).toEqual({
      ok: false,
      code: 'SOCKET_URL_INVALID',
    });
  });

  it('returns a structured success for a valid endpoint', async () => {
    const config = {
      target: 'desktop' as const,
      socketUrl: 'https://play.example.test',
      platform: 'win32' as const,
      appVersion: '1.0.0',
    };
    harness.getDesktopRuntimeConfig.mockReturnValue(config);
    const { runtimeConfigHandler, webContents } = registerRuntimeConfigHandler();

    expect(runtimeConfigHandler({ sender: webContents })).toEqual({
      ok: true,
      config,
    });
  });

  it('rethrows unexpected main-process errors for generic renderer handling', async () => {
    const error = new Error('secret unexpected main-process detail');
    harness.getDesktopRuntimeConfig.mockImplementation(() => { throw error; });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { runtimeConfigHandler, webContents } = registerRuntimeConfigHandler();

    await expect(Promise.resolve().then(() => runtimeConfigHandler({ sender: webContents })))
      .rejects.toBe(error);
    expect(consoleError).toHaveBeenCalledWith(
      'Desktop runtime configuration is unavailable.',
      error,
    );
  });

  it('reports the settled fullscreen state after an Electron transition', () => {
    vi.useFakeTimers();
    const webContents = { send: vi.fn() };
    const fullscreenHandlers = new Map<string, () => void>();
    let fullscreen = false;
    const window = {
      webContents,
      close: vi.fn(),
      isDestroyed: () => false,
      isFullScreen: () => fullscreen,
      isMaximized: () => false,
      isResizable: () => true,
      setFullScreen: vi.fn(),
      on: vi.fn((event: string, handler: () => void) => {
        fullscreenHandlers.set(event, handler);
      }),
    };
    const quitController = new QuitRequestController(window as never);

    registerWindowHandlers(window as never, false, quitController);
    fullscreen = true;
    fullscreenHandlers.get('enter-full-screen')?.();

    expect(webContents.send).not.toHaveBeenCalled();
    vi.runAllTimers();

    expect(webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.windowFullscreenChanged, {
      fullscreen: true,
      maximized: false,
      resizable: true,
    });
  });

  it('validates LAN payloads and keeps discovery data scoped to the renderer', async () => {
    const webContents = { send: vi.fn() };
    const window = {
      webContents,
      close: vi.fn(),
      isDestroyed: () => false,
      isFullScreen: () => false,
      isMaximized: () => false,
      isResizable: () => true,
      setFullScreen: vi.fn(),
      on: vi.fn(),
    };
    const status: HostRuntimeStatus = {
      state: 'READY',
      platform: 'win32',
      appVersion: '3.0.0',
      gamePort: 43_123,
      localEndpoint: 'http://127.0.0.1:43123',
      lanAvailable: true,
      interfaces: [],
      advertisedEndpoints: [],
    };
    const hostRuntime = {
      status,
      gamePort: 43_123,
      start: vi.fn(async () => status),
      stop: vi.fn(async () => status),
      setHosting: vi.fn(),
      onStatusChanged: vi.fn(() => () => undefined),
    };
    const games: DiscoveredLanGame[] = [];
    const discovery = {
      startBrowsing: vi.fn(async () => undefined),
      stopBrowsing: vi.fn(async () => undefined),
      getGames: vi.fn(() => games),
      startAdvertising: vi.fn(async () => undefined),
      stopAdvertising: vi.fn(async () => undefined),
      onGamesChanged: vi.fn(() => () => undefined),
    };
    const quitController = new QuitRequestController(window as never);
    registerWindowHandlers(window as never, false, quitController, {
      hostRuntime: hostRuntime as never,
      discovery: discovery as never,
    });

    const hostStart = harness.handlers.get(IPC_CHANNELS.hostStart)!;
    const discoveryStart = harness.handlers.get(IPC_CHANNELS.discoveryStartAdvertising)!;
    await expect(Promise.resolve().then(() => hostStart({ sender: webContents }, { port: 0 })))
      .rejects.toThrow('Invalid host game port');
    await expect(Promise.resolve().then(() => discoveryStart(
      { sender: webContents },
      { roomCode: 'LAN-1234', token: 'secret' },
    ))).rejects.toThrow('Invalid LAN advertisement request');
    expect(hostRuntime.start).not.toHaveBeenCalled();
    expect(discovery.startAdvertising).not.toHaveBeenCalled();
    await expect(Promise.resolve().then(() => hostStart({ sender: {} }, {})))
      .rejects.toThrow('Invalid IPC sender');
  });
});
