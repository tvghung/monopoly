import { randomUUID } from 'node:crypto';
import { ipcMain, type BrowserWindow, type WebContents } from 'electron';
import {
  DesktopRuntimeConfigError,
  getDesktopRuntimeConfig,
  type DesktopRuntimeConfigResult,
} from '../runtimeConfig';
import { openExternalUrl } from './externalLinks';
import { IPC_CHANNELS, isQuitRequestId, type DesktopWindowState } from './channels';
import {
  HostRuntimeController,
  type HostRuntimeStatus,
  type HostStartOptions,
} from '../hostRuntime';
import { LANDiscoveryController } from '../lanDiscovery';
import { resolveNetworkInterfaces } from '../networkInterfaces';

const QUIT_RESPONSE_TIMEOUT_MS = 2_000;

interface CloseEventLike {
  preventDefault(): void;
}

type QuitIntent = 'window-close' | 'application-quit';

interface PendingQuitRequest {
  requestId: string;
  intent: QuitIntent;
  promise: Promise<boolean>;
  resolve: (allowQuit: boolean) => void;
}

export class QuitRequestController {
  private pendingRequest: PendingQuitRequest | null = null;
  private allowNextClose = false;
  private timeout: NodeJS.Timeout | null = null;

  public constructor(private readonly window: BrowserWindow) {}

  public handleClose(event: CloseEventLike): void {
    if (this.allowNextClose) {
      this.allowNextClose = false;
      return;
    }

    event.preventDefault();
    if (this.pendingRequest || this.window.isDestroyed()) return;

    void this.request('window-close');
  }

  public requestApplicationQuit(): Promise<boolean> {
    if (this.window.isDestroyed()) return Promise.resolve(true);
    return this.pendingRequest?.promise ?? this.request('application-quit');
  }

  public respond(requestId: string, allowQuit: boolean): void {
    if (requestId !== this.pendingRequest?.requestId) return;
    this.resolvePending(allowQuit);
  }

  public armNextClose(): void {
    this.allowNextClose = true;
  }

  public dispose(): void {
    const pending = this.pendingRequest;
    this.clearPending();
    pending?.resolve(false);
  }

  private request(intent: QuitIntent): Promise<boolean> {
    const requestId = randomUUID();
    let resolve!: (allowQuit: boolean) => void;
    const promise = new Promise<boolean>(settle => {
      resolve = settle;
    });
    this.pendingRequest = { requestId, intent, promise, resolve };
    try {
      this.window.webContents.send(IPC_CHANNELS.quitRequested, requestId);
    } catch {
      this.resolvePending(true);
      return promise;
    }
    this.timeout = setTimeout(() => this.resolvePending(true), QUIT_RESPONSE_TIMEOUT_MS);
    return promise;
  }

  private resolvePending(allowQuit: boolean): void {
    const pending = this.pendingRequest;
    if (!pending) return;
    this.clearPending();
    pending.resolve(allowQuit);
    if (pending.intent === 'window-close' && allowQuit) this.allowAndClose();
  }

  private clearPending(): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
    this.pendingRequest = null;
  }

  private allowAndClose(): void {
    if (this.window.isDestroyed()) return;
    this.allowNextClose = true;
    this.window.close();
  }
}

function isSender(window: BrowserWindow, event: { sender: WebContents }): boolean {
  return event.sender === window.webContents;
}

function getWindowState(window: BrowserWindow): DesktopWindowState {
  return {
    fullscreen: window.isFullScreen(),
    maximized: window.isMaximized(),
    resizable: window.isResizable(),
  };
}

function getRuntimeConfigResult(): DesktopRuntimeConfigResult {
  try {
    return { ok: true, config: getDesktopRuntimeConfig() };
  } catch (error) {
    console.error('Desktop runtime configuration is unavailable.', error);
    if (error instanceof DesktopRuntimeConfigError) {
      return { ok: false, code: error.code };
    }
    throw error;
  }
}

export interface DesktopIpcServices {
  hostRuntime: HostRuntimeController;
  discovery: LANDiscoveryController;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseHostStartOptions(value: unknown): HostStartOptions {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.keys(value).some(key => key !== 'port')) {
    throw new Error('Invalid host start request.');
  }
  const port = value.port;
  if (port !== undefined
    && (typeof port !== 'number' || !Number.isSafeInteger(port) || port < 1 || port > 65_535)) {
    throw new Error('Invalid host game port.');
  }
  return port === undefined ? {} : { port };
}

function parseAdvertisingOptions(value: unknown): { roomCode: string } {
  if (!isRecord(value) || Object.keys(value).some(key => key !== 'roomCode')
    || typeof value.roomCode !== 'string'
    || !/^[A-Z0-9-]{1,20}$/u.test(value.roomCode.trim().toUpperCase())) {
    throw new Error('Invalid LAN advertisement request.');
  }
  return { roomCode: value.roomCode.trim().toUpperCase() };
}

export function registerWindowHandlers(
  window: BrowserWindow,
  development: boolean,
  quitController: QuitRequestController,
  services?: DesktopIpcServices,
): void {
  ipcMain.handle(IPC_CHANNELS.runtimeConfig, event => {
    if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
    return getRuntimeConfigResult();
  });
  ipcMain.handle(IPC_CHANNELS.windowGetState, event => {
    if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
    return getWindowState(window);
  });
  ipcMain.handle(IPC_CHANNELS.windowSetFullscreen, (event, value: unknown) => {
    if (!isSender(window, event) || typeof value !== 'boolean') throw new Error('Invalid IPC request.');
    window.setFullScreen(value);
  });
  ipcMain.handle(IPC_CHANNELS.windowToggleFullscreen, event => {
    if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
    window.setFullScreen(!window.isFullScreen());
  });
  ipcMain.on(IPC_CHANNELS.quitResponse, (event, requestId: unknown, allowQuit: unknown) => {
    if (!isSender(window, event) || !isQuitRequestId(requestId) || typeof allowQuit !== 'boolean') return;
    quitController.respond(requestId, allowQuit);
  });
  ipcMain.handle(IPC_CHANNELS.openExternal, (event, rawUrl: unknown) => {
    if (!isSender(window, event) || typeof rawUrl !== 'string') throw new Error('Invalid IPC request.');
    return openExternalUrl(rawUrl, development);
  });

  let removeHostStatusListener: (() => void) | undefined;
  let removeGamesListener: (() => void) | undefined;
  if (services) {
    ipcMain.handle(IPC_CHANNELS.hostGetStatus, event => {
      if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
      return services.hostRuntime.status;
    });
    ipcMain.handle(IPC_CHANNELS.hostStart, async (event, value: unknown) => {
      if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
      const options = parseHostStartOptions(value);
      try {
        return { ok: true, status: await services.hostRuntime.start(options) };
      } catch {
        return { ok: false, status: services.hostRuntime.status };
      }
    });
    ipcMain.handle(IPC_CHANNELS.hostStop, async event => {
      if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
      try {
        return { ok: true, status: await services.hostRuntime.stop() };
      } catch {
        return { ok: false, status: services.hostRuntime.status };
      }
    });
    ipcMain.handle(IPC_CHANNELS.lanGetInterfaces, event => {
      if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
      return resolveNetworkInterfaces();
    });
    ipcMain.handle(IPC_CHANNELS.discoveryStartBrowsing, async event => {
      if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
      try {
        await services.discovery.startBrowsing();
        return { ok: true };
      } catch {
        return { ok: false, code: 'FAILED' };
      }
    });
    ipcMain.handle(IPC_CHANNELS.discoveryStopBrowsing, async event => {
      if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
      await services.discovery.stopBrowsing();
    });
    ipcMain.handle(IPC_CHANNELS.discoveryGetGames, event => {
      if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
      return services.discovery.getGames();
    });
    ipcMain.handle(IPC_CHANNELS.discoveryStartAdvertising, (event, value: unknown) => {
      if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
      const options = parseAdvertisingOptions(value);
      const port = services.hostRuntime.gamePort;
      if (port === null) return { ok: false, code: 'FAILED' };
      return Promise.resolve()
        .then(() => services.discovery.startAdvertising({ roomCode: options.roomCode, port }))
        .then(() => {
          services.hostRuntime.setHosting(true);
          return { ok: true as const };
        })
        .catch(() => ({ ok: false as const, code: 'FAILED' as const }));
    });
    ipcMain.handle(IPC_CHANNELS.discoveryStopAdvertising, async event => {
      if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
      await services.discovery.stopAdvertising();
      services.hostRuntime.setHosting(false);
    });
    removeHostStatusListener = services.hostRuntime.onStatusChanged((status: HostRuntimeStatus) => {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.hostStatusChanged, status);
    });
    removeGamesListener = services.discovery.onGamesChanged(games => {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.discoveryGamesChanged, games);
    });
  }

  const sendFullscreenState = () => {
    setTimeout(() => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.windowFullscreenChanged, getWindowState(window));
      }
    }, 0);
  };
  window.on('enter-full-screen', sendFullscreenState);
  window.on('leave-full-screen', sendFullscreenState);
  window.on('closed', () => {
    quitController.dispose();
    removeHostStatusListener?.();
    removeGamesListener?.();
    ipcMain.removeHandler(IPC_CHANNELS.runtimeConfig);
    ipcMain.removeHandler(IPC_CHANNELS.windowGetState);
    ipcMain.removeHandler(IPC_CHANNELS.windowSetFullscreen);
    ipcMain.removeHandler(IPC_CHANNELS.windowToggleFullscreen);
    ipcMain.removeHandler(IPC_CHANNELS.openExternal);
    ipcMain.removeHandler(IPC_CHANNELS.hostGetStatus);
    ipcMain.removeHandler(IPC_CHANNELS.hostStart);
    ipcMain.removeHandler(IPC_CHANNELS.hostStop);
    ipcMain.removeHandler(IPC_CHANNELS.lanGetInterfaces);
    ipcMain.removeHandler(IPC_CHANNELS.discoveryStartBrowsing);
    ipcMain.removeHandler(IPC_CHANNELS.discoveryStopBrowsing);
    ipcMain.removeHandler(IPC_CHANNELS.discoveryGetGames);
    ipcMain.removeHandler(IPC_CHANNELS.discoveryStartAdvertising);
    ipcMain.removeHandler(IPC_CHANNELS.discoveryStopAdvertising);
    ipcMain.removeAllListeners(IPC_CHANNELS.quitResponse);
  });
}
