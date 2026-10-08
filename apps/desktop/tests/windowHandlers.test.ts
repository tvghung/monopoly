import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HostRuntimeStatus } from '../src/hostRuntime';
import type { AppUpdateState } from '../src/update/updateTypes';

type IpcHandler = (event: { sender: object }, ...args: unknown[]) => unknown;

const harness = vi.hoisted(() => ({
  handlers: new Map<string, IpcHandler>(),
  getDesktopRuntimeConfig: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getVersion: vi.fn(() => '1.0.0'),
    quit: vi.fn(),
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

import { app, ipcMain } from 'electron';

import { AppQuitCoordinator } from '../src/appQuitCoordinator';
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

  it('validates online activation and lookup, and removes both handlers on close', async () => {
    const fixture = createWindow();
    const status = { state: 'HOSTING', onlineState: 'READY' } as HostRuntimeStatus;
    const hostRuntime = {
      status,
      activateOnlineRoom: vi.fn(async () => status),
      resolveOnlineRoom: vi.fn(async () => 'https://room.trycloudflare.com'),
      onStatusChanged: vi.fn(() => () => undefined),
    };
    registerWindowHandlers(
      fixture.window as never,
      false,
      new QuitRequestController(fixture.window as never),
      { hostRuntime: hostRuntime as never },
    );
    const activate = harness.handlers.get(IPC_CHANNELS.hostActivateOnline)!;
    const lookup = harness.handlers.get(IPC_CHANNELS.onlineFindRoom)!;

    await expect(activate({ sender: fixture.webContents }, { roomCode: 'otb-abc234' }))
      .resolves.toEqual({ ok: true, status });
    expect(hostRuntime.activateOnlineRoom).toHaveBeenCalledWith('OTB-ABC234');
    await expect(lookup({ sender: fixture.webContents }, { roomCode: 'otb-abc234' }))
      .resolves.toEqual({ ok: true, endpoint: 'https://room.trycloudflare.com' });
    expect(hostRuntime.resolveOnlineRoom).toHaveBeenCalledWith('OTB-ABC234');

    await expect(activate({ sender: fixture.webContents }, { roomCode: 'bad code' }))
      .rejects.toThrow();
    await expect(lookup({ sender: {} }, { roomCode: 'OTB-ABC234' }))
      .rejects.toThrow('Invalid IPC sender');
    expect(hostRuntime.resolveOnlineRoom).toHaveBeenCalledTimes(1);

    fixture.fullscreenHandlers.get('closed')?.();
    expect(vi.mocked(ipcMain.removeHandler)).toHaveBeenCalledWith(IPC_CHANNELS.hostActivateOnline);
    expect(vi.mocked(ipcMain.removeHandler)).toHaveBeenCalledWith(IPC_CHANNELS.onlineFindRoom);
  });

  describe('LAN room lookup channel', () => {
    const hostRuntime = {
      status: {},
      start: vi.fn(),
      stop: vi.fn(),
      refreshNetwork: vi.fn(),
      onStatusChanged: vi.fn(() => () => undefined),
    };

    function registerWithFinder(findRoom: (roomCode: string) => Promise<unknown>) {
      const fixture = createWindow();
      const lanFinder = { findRoom: vi.fn(findRoom), cancel: vi.fn() };
      registerWindowHandlers(
        fixture.window as never,
        false,
        new QuitRequestController(fixture.window as never),
        { hostRuntime: hostRuntime as never, lanFinder: lanFinder as never },
      );
      return { ...fixture, lanFinder, handler: harness.handlers.get(IPC_CHANNELS.lanFindRoom)! };
    }

    it('uses the namespaced channel name', () => {
      expect(IPC_CHANNELS.lanFindRoom).toBe('ownTheBlock:lan:find-room');
    });

    it('is not registered when the desktop has no finder', () => {
      const fixture = createWindow();
      registerWindowHandlers(
        fixture.window as never,
        false,
        new QuitRequestController(fixture.window as never),
        { hostRuntime: hostRuntime as never },
      );

      expect(harness.handlers.has(IPC_CHANNELS.lanFindRoom)).toBe(false);
    });

    it('passes a canonical room code to the finder and returns exactly its answer', async () => {
      const found = { ok: true as const, endpoint: 'http://192.168.1.20:53120' };
      const { handler, webContents, lanFinder } = registerWithFinder(() => Promise.resolve(found));

      await expect(handler({ sender: webContents }, { roomCode: 'otb-abc234' })).resolves.toEqual(found);
      expect(lanFinder.findRoom).toHaveBeenCalledExactlyOnceWith('OTB-ABC234');

      lanFinder.findRoom.mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' });
      await expect(handler({ sender: webContents }, { roomCode: 'OTB-ZZZZZZ' }))
        .resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
    });

    it.each([
      ['no payload', undefined],
      ['a bare string', 'OTB-ABC234'],
      ['an array', ['OTB-ABC234']],
      ['an empty object', {}],
      ['a numeric code', { roomCode: 5 }],
      ['an empty code', { roomCode: '' }],
      ['a code with a space', { roomCode: 'OTB ABC' }],
      ['a code with a symbol', { roomCode: 'OTB_ABC' }],
      ['a 21-character code', { roomCode: 'A'.repeat(21) }],
      ['an extra field', { roomCode: 'OTB-ABC234', address: '192.168.1.20' }],
    ])('rejects %s before it reaches the finder', async (_name, payload) => {
      const { handler, webContents, lanFinder } = registerWithFinder(() => Promise.resolve({ ok: false, code: 'NOT_FOUND' }));

      await expect(handler({ sender: webContents }, payload)).rejects.toThrow('Invalid LAN find request');
      expect(lanFinder.findRoom).not.toHaveBeenCalled();
    });

    it('refuses a sender that is not the window', async () => {
      const { handler, lanFinder } = registerWithFinder(() => Promise.resolve({ ok: false, code: 'NOT_FOUND' }));

      await expect(handler({ sender: {} }, { roomCode: 'OTB-ABC234' })).rejects.toThrow('Invalid IPC sender');
      expect(lanFinder.findRoom).not.toHaveBeenCalled();
    });

    it('reports UNAVAILABLE instead of an error when the finder itself fails', async () => {
      const { handler, webContents } = registerWithFinder(() => Promise.reject(new Error('socket exploded')));

      await expect(handler({ sender: webContents }, { roomCode: 'OTB-ABC234' }))
        .resolves.toEqual({ ok: false, code: 'UNAVAILABLE' });
    });

    it('removes its handler and stops a running search when the window closes', () => {
      const { fullscreenHandlers, lanFinder } = registerWithFinder(() => Promise.resolve({ ok: false, code: 'NOT_FOUND' }));

      fullscreenHandlers.get('closed')?.();

      expect(lanFinder.cancel).toHaveBeenCalledOnce();
      expect(vi.mocked(ipcMain.removeHandler)).toHaveBeenCalledWith(IPC_CHANNELS.lanFindRoom);
    });
  });
});

describe('update channels', () => {
  const hostRuntime = {
    status: {},
    start: vi.fn(),
    stop: vi.fn(),
    refreshNetwork: vi.fn(),
    onStatusChanged: vi.fn(() => () => undefined),
  };
  const state: AppUpdateState = { phase: 'available', currentVersion: '1.1.1', installMode: 'restart' };

  function registerWithUpdates(overrides: Record<string, unknown> = {}) {
    const fixture = createWindow();
    let pushed: ((next: AppUpdateState) => void) | undefined;
    const unsubscribe = vi.fn();
    const updateService = {
      getState: vi.fn(() => state),
      onStateChanged: vi.fn((listener: (next: AppUpdateState) => void) => {
        pushed = listener;
        return unsubscribe;
      }),
      checkForUpdates: vi.fn(() => Promise.resolve({ ...state, phase: 'up-to-date' as const })),
      downloadUpdate: vi.fn(() => Promise.resolve(state)),
      cancelDownload: vi.fn(() => state),
      installUpdate: vi.fn(() => Promise.resolve(state)),
      ...overrides,
    };
    registerWindowHandlers(
      fixture.window as never,
      false,
      new QuitRequestController(fixture.window as never),
      { hostRuntime: hostRuntime as never, updateService: updateService as never },
    );
    const handler = (channel: string) => harness.handlers.get(channel)!;
    return { ...fixture, updateService, unsubscribe, handler, push: (next: AppUpdateState) => pushed?.(next) };
  }

  it('uses namespaced channel names', () => {
    expect([
      IPC_CHANNELS.updateGetState,
      IPC_CHANNELS.updateCheck,
      IPC_CHANNELS.updateDownload,
      IPC_CHANNELS.updateCancel,
      IPC_CHANNELS.updateInstall,
      IPC_CHANNELS.updateStateChanged,
    ]).toEqual([
      'ownTheBlock:update:get-state',
      'ownTheBlock:update:check',
      'ownTheBlock:update:download',
      'ownTheBlock:update:cancel',
      'ownTheBlock:update:install',
      'ownTheBlock:update:state-changed',
    ]);
  });

  it('registers nothing when the desktop has no updater', () => {
    const fixture = createWindow();
    registerWindowHandlers(
      fixture.window as never,
      false,
      new QuitRequestController(fixture.window as never),
      { hostRuntime: hostRuntime as never },
    );

    for (const channel of [IPC_CHANNELS.updateGetState, IPC_CHANNELS.updateCheck, IPC_CHANNELS.updateDownload,
      IPC_CHANNELS.updateCancel, IPC_CHANNELS.updateInstall]) {
      expect(harness.handlers.has(channel)).toBe(false);
    }
  });

  it('refuses a sender that is not the window on every channel and calls nothing', async () => {
    const { handler, updateService } = registerWithUpdates();

    for (const channel of [IPC_CHANNELS.updateGetState, IPC_CHANNELS.updateCheck, IPC_CHANNELS.updateDownload,
      IPC_CHANNELS.updateCancel, IPC_CHANNELS.updateInstall]) {
      await expect(Promise.resolve().then(() => handler(channel)({ sender: {} }))).rejects.toThrow('Invalid IPC sender');
    }
    for (const method of Object.values(updateService).filter(vi.isMockFunction)) {
      if (method !== updateService.onStateChanged) expect(method).not.toHaveBeenCalled();
    }
  });

  it('answers the state, and a check as a manual one that resolves once the look is over', async () => {
    const { handler, webContents, updateService } = registerWithUpdates();

    expect(handler(IPC_CHANNELS.updateGetState)({ sender: webContents })).toEqual(state);
    await expect(handler(IPC_CHANNELS.updateCheck)({ sender: webContents })).resolves.toMatchObject({ phase: 'up-to-date' });
    expect(updateService.checkForUpdates).toHaveBeenCalledExactlyOnceWith('manual');
  });

  it('starts a download or an install and answers at once; the rest arrives as pushed states', () => {
    const forever = () => new Promise<AppUpdateState>(() => undefined);
    const { handler, webContents, updateService } = registerWithUpdates({
      downloadUpdate: vi.fn(forever),
      installUpdate: vi.fn(forever),
    });

    expect(handler(IPC_CHANNELS.updateDownload)({ sender: webContents })).toEqual(state);
    expect(handler(IPC_CHANNELS.updateInstall)({ sender: webContents })).toEqual(state);
    expect(updateService.downloadUpdate).toHaveBeenCalledOnce();
    expect(updateService.installUpdate).toHaveBeenCalledOnce();
  });

  it('cancels a download', () => {
    const { handler, webContents, updateService } = registerWithUpdates();

    expect(handler(IPC_CHANNELS.updateCancel)({ sender: webContents })).toEqual(state);
    expect(updateService.cancelDownload).toHaveBeenCalledOnce();
  });

  it('takes no payload: whatever a renderer sends along never reaches the updater', async () => {
    const { handler, webContents, updateService } = registerWithUpdates();
    const hostile = { url: 'https://evil.example/Setup.exe', path: 'C:\\Windows\\System32\\cmd.exe', version: '9.9.9' };

    await handler(IPC_CHANNELS.updateCheck)({ sender: webContents }, hostile);
    handler(IPC_CHANNELS.updateDownload)({ sender: webContents }, hostile);
    handler(IPC_CHANNELS.updateCancel)({ sender: webContents }, hostile);
    handler(IPC_CHANNELS.updateInstall)({ sender: webContents }, hostile);

    expect(updateService.checkForUpdates).toHaveBeenCalledExactlyOnceWith('manual');
    expect(updateService.downloadUpdate).toHaveBeenCalledExactlyOnceWith();
    expect(updateService.cancelDownload).toHaveBeenCalledExactlyOnceWith();
    expect(updateService.installUpdate).toHaveBeenCalledExactlyOnceWith();
  });

  it('pushes every state change to the window', () => {
    const { push, webContents } = registerWithUpdates();
    const downloading: AppUpdateState = { ...state, phase: 'downloading', progress: { receivedBytes: 5, totalBytes: 10 } };

    push(downloading);

    expect(webContents.send).toHaveBeenCalledExactlyOnceWith(IPC_CHANNELS.updateStateChanged, downloading);
  });

  it('stops listening and removes its handlers when the window closes', () => {
    const { fullscreenHandlers, unsubscribe } = registerWithUpdates();

    fullscreenHandlers.get('closed')?.();

    expect(unsubscribe).toHaveBeenCalledOnce();
    for (const channel of [IPC_CHANNELS.updateGetState, IPC_CHANNELS.updateCheck, IPC_CHANNELS.updateDownload,
      IPC_CHANNELS.updateCancel, IPC_CHANNELS.updateInstall]) {
      expect(vi.mocked(ipcMain.removeHandler)).toHaveBeenCalledWith(channel);
    }
  });
});

describe('quit channel ("Thoát" on the start screen)', () => {
  function registerQuit() {
    const fixture = createWindow();
    const controller = new QuitRequestController(fixture.window as never);
    registerWindowHandlers(fixture.window as never, false, controller);
    return { ...fixture, controller, handler: harness.handlers.get(IPC_CHANNELS.quitExit)! };
  }

  beforeEach(() => {
    vi.mocked(app.quit).mockReset();
  });

  it('uses the namespaced channel name', () => {
    expect(IPC_CHANNELS.quitExit).toBe('ownTheBlock:quit:exit');
  });

  it('refuses a sender that is not the window and quits nothing', () => {
    const { handler, webContents } = registerQuit();

    expect(() => handler({ sender: {} })).toThrow('Invalid IPC sender');
    expect(app.quit).not.toHaveBeenCalled();
    expect(webContents.send).not.toHaveBeenCalled();
  });

  it('quits the application once, without asking the renderer a second time', async () => {
    const { handler, webContents, controller } = registerQuit();

    handler({ sender: webContents });

    expect(app.quit).toHaveBeenCalledOnce();
    // The renderer's own question is the confirmation: the coordinator's question to the renderer is answered at once.
    await expect(controller.requestApplicationQuit()).resolves.toBe(true);
    expect(webContents.send).not.toHaveBeenCalled();
  });

  it('approves only the one quit it started', async () => {
    vi.useFakeTimers();
    const { handler, webContents, controller } = registerQuit();
    handler({ sender: webContents });
    await controller.requestApplicationQuit();

    const next = controller.requestApplicationQuit();

    expect(webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.quitRequested, expect.any(String));
    vi.advanceTimersByTime(2_000);
    await expect(next).resolves.toBe(true);
    controller.dispose();
  });

  it('ends in the same shutdown as closing the window: the Host is stopped, then the app quits', async () => {
    const { handler, webContents, controller } = registerQuit();
    const order: string[] = [];
    const coordinator = new AppQuitCoordinator({
      hasLiveWindow: () => true,
      requestRendererDecision: () => controller.requestApplicationQuit(),
      stopRuntime: async () => { order.push('stop host'); },
      armFinalWindowClose: () => { controller.armNextClose(); order.push('arm final close'); },
      quitApp: () => { order.push('quit'); },
    });
    const event = { preventDefault: vi.fn() };
    vi.mocked(app.quit).mockImplementation(() => coordinator.handleBeforeQuit(event));

    handler({ sender: webContents });
    await coordinator.waitForSettled();

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(order).toEqual(['stop host', 'arm final close', 'quit']);
    expect(webContents.send).not.toHaveBeenCalled();
    // The window's final close is let through (it is the one the coordinator armed), not turned into another question.
    const closeEvent = { preventDefault: vi.fn() };
    controller.handleClose(closeEvent);
    expect(closeEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('removes its handler when the window closes', () => {
    const { fullscreenHandlers } = registerQuit();

    fullscreenHandlers.get('closed')?.();

    expect(vi.mocked(ipcMain.removeHandler)).toHaveBeenCalledWith(IPC_CHANNELS.quitExit);
  });
});
