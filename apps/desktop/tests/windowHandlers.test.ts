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
});
