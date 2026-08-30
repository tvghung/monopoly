import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HostRuntimeStatus } from '../src/hostRuntime';

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

afterEach(() => {
  vi.useRealTimers();
  harness.handlers.clear();
  harness.getDesktopRuntimeConfig.mockReset();
  vi.restoreAllMocks();
});

function createWindow() {
  const fullscreenHandlers = new Map<string, () => void>();
  let fullscreen = false;
  const webContents = { send: vi.fn() };
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
  return {
    fullscreenHandlers,
    setFullscreen: (value: boolean) => { fullscreen = value; },
    webContents,
    window,
  };
}

function registerRuntimeConfigHandler() {
  const fixture = createWindow();
  registerWindowHandlers(
    fixture.window as never,
    false,
    new QuitRequestController(fixture.window as never),
  );
  return {
    ...fixture,
    handler: harness.handlers.get(IPC_CHANNELS.runtimeConfig)!,
  };
}

describe('desktop IPC lifecycle', () => {
  it('returns packaged runtime configuration without requiring an external socket URL', () => {
    const config = {
      target: 'desktop' as const,
      platform: 'win32' as const,
      appVersion: '3.0.0',
    };
    harness.getDesktopRuntimeConfig.mockReturnValue(config);
    const { handler, webContents } = registerRuntimeConfigHandler();

    expect(handler({ sender: webContents })).toEqual({ ok: true, config });
  });

  it('returns a structured failure for an invalid configured endpoint', () => {
    harness.getDesktopRuntimeConfig.mockImplementation(() => {
      throw new DesktopRuntimeConfigError('SOCKET_URL_INVALID', 'secret endpoint detail');
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { handler, webContents } = registerRuntimeConfigHandler();

    expect(handler({ sender: webContents })).toEqual({
      ok: false,
      code: 'SOCKET_URL_INVALID',
    });
  });

  it('reports the settled fullscreen state after Electron transitions', () => {
    vi.useFakeTimers();
    harness.getDesktopRuntimeConfig.mockReturnValue({
      target: 'desktop',
      platform: 'win32',
      appVersion: '3.0.0',
    });
    const fixture = registerRuntimeConfigHandler();
    fixture.setFullscreen(true);
    fixture.fullscreenHandlers.get('enter-full-screen')?.();

    expect(fixture.webContents.send).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(fixture.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.windowFullscreenChanged,
      { fullscreen: true, maximized: false, resizable: true },
    );
  });

  it('validates host start and network refresh requests at the IPC boundary', async () => {
    const fixture = createWindow();
    const status: HostRuntimeStatus = {
      state: 'HOSTING',
      platform: 'win32',
      appVersion: '3.0.0',
      gamePort: 43_123,
      localEndpoint: 'http://127.0.0.1:43123',
      lanAvailable: true,
      interfaces: [],
      advertisedEndpoints: ['http://192.168.1.15:43123'],
      selectedLanUrl: 'http://192.168.1.15:43123',
    };
    const hostRuntime = {
      status,
      start: vi.fn(async () => status),
      stop: vi.fn(async () => status),
      refreshNetwork: vi.fn(() => status),
      onStatusChanged: vi.fn(() => () => undefined),
    };
    registerWindowHandlers(
      fixture.window as never,
      false,
      new QuitRequestController(fixture.window as never),
      { hostRuntime: hostRuntime as never },
    );
    const start = harness.handlers.get(IPC_CHANNELS.hostStart)!;
    const refresh = harness.handlers.get(IPC_CHANNELS.hostRefreshNetwork)!;

    await expect(start(
      { sender: fixture.webContents },
      { port: 0, preferredAddress: '192.168.1.15' },
    )).resolves.toEqual({ ok: true, status });
    expect(hostRuntime.start).toHaveBeenCalledWith({
      port: 0,
      preferredAddress: '192.168.1.15',
    });
    expect(refresh(
      { sender: fixture.webContents },
      { preferredAddress: '100.64.0.4' },
    )).toEqual(status);
    expect(hostRuntime.refreshNetwork).toHaveBeenCalledWith('100.64.0.4');

    await expect(Promise.resolve().then(() => start(
      { sender: fixture.webContents },
      { port: -1 },
    ))).rejects.toThrow('Invalid host game port');
    await expect(Promise.resolve().then(() => start(
      { sender: fixture.webContents },
      { environment: 'production' },
    ))).rejects.toThrow('Invalid host start request');
    await expect(Promise.resolve().then(() => refresh(
      { sender: fixture.webContents },
      { preferredAddress: '192.168.1.15', extra: true },
    ))).rejects.toThrow('Invalid network refresh request');
    await expect(Promise.resolve().then(() => start({ sender: {} }, {})))
      .rejects.toThrow('Invalid IPC sender');
  });
});
