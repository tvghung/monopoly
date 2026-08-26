import { afterEach, describe, expect, it, vi } from 'vitest';

type IpcHandler = (event: { sender: object }, ...args: unknown[]) => unknown;

const harness = vi.hoisted(() => ({
  handlers: new Map<string, IpcHandler>(),
  runtimeConfigError: new Error('missing release endpoint'),
}));

vi.mock('electron', () => ({
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

vi.mock('../src/runtimeConfig', () => ({
  getDesktopRuntimeConfig: vi.fn(() => {
    throw harness.runtimeConfigError;
  }),
}));

import { IPC_CHANNELS } from '../src/ipc/channels';
import { QuitRequestController, registerWindowHandlers } from '../src/ipc/windowHandlers';

afterEach(() => {
  vi.useRealTimers();
  harness.handlers.clear();
  vi.restoreAllMocks();
});

describe('runtime config IPC lifecycle', () => {
  it('defers packaged configuration failure until the renderer requests it', async () => {
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

    await expect(Promise.resolve().then(() => runtimeConfigHandler?.({ sender: webContents })))
      .rejects.toBe(harness.runtimeConfigError);
    expect(window.close).not.toHaveBeenCalled();
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
