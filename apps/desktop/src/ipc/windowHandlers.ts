import { randomUUID } from 'node:crypto';
import { app, ipcMain, type BrowserWindow, type WebContents } from 'electron';
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
import type { LanFindRoomResult, LanRoomFinder } from '../lanFinder';
import type { AppUpdateController, AppUpdateState } from '../update/updateTypes';

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
  private applicationQuitApproved = false;
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
    if (this.applicationQuitApproved) {
      // The renderer already put the question to the player (the "Thoát" button): asking again would only wait for it.
      this.applicationQuitApproved = false;
      return Promise.resolve(true);
    }
    return this.pendingRequest?.promise ?? this.request('application-quit');
  }

  /** The renderer asked the player and got a yes: the next application quit needs no second question. */
  public approveApplicationQuit(): void {
    this.applicationQuitApproved = true;
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
  /** Finds a Host by room code on the local network; without it the find-room channel is not registered. */
  lanFinder?: LanRoomFinder;
  /** The in-app updater; without it the update channels are not registered. */
  updateService?: AppUpdateController;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseHostStartOptions(value: unknown): HostStartOptions {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.keys(value).some(
    key => key !== 'port' && key !== 'preferredAddress' && key !== 'mode' && key !== 'roomCode',
  )) {
    throw new Error('Invalid host start request.');
  }
  const port = value.port;
  if (port !== undefined
    && (typeof port !== 'number' || !Number.isSafeInteger(port) || port < 0 || port > 65_535)) {
    throw new Error('Invalid host game port.');
  }
  const preferredAddress = value.preferredAddress;
  if (value.mode !== undefined && value.mode !== 'LAN' && value.mode !== 'ONLINE') {
    throw new Error('Invalid connection mode.');
  }
  if (value.mode === 'ONLINE' && (typeof value.roomCode !== 'string' || !/^[A-Z0-9-]{1,20}$/.test(value.roomCode))) {
    throw new Error('Invalid online room code.');
  }
  if (preferredAddress !== undefined
    && (typeof preferredAddress !== 'string'
      || !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(preferredAddress))) {
    throw new Error('Invalid preferred LAN address.');
  }
  return {
    ...(port === undefined ? {} : { port }),
    ...(preferredAddress === undefined ? {} : { preferredAddress }),
    ...(value.mode === undefined ? {} : { mode: value.mode }),
    ...(typeof value.roomCode === 'string' ? { roomCode: value.roomCode } : {}),
  };
}

function parseFindRoomRequest(value: unknown): string {
  if (!isRecord(value) || Object.keys(value).length !== 1
    || typeof value.roomCode !== 'string' || !/^[A-Za-z0-9-]{1,20}$/u.test(value.roomCode)) {
    throw new Error('Invalid LAN find request.');
  }
  return value.roomCode.toUpperCase();
}

function parseNetworkRefresh(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || Object.keys(value).some(key => key !== 'preferredAddress')
    || typeof value.preferredAddress !== 'string'
    || !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(value.preferredAddress)) {
    throw new Error('Invalid network refresh request.');
  }
  return value.preferredAddress;
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
  // "Thoát" on the start screen. The player has already answered the renderer's own question, so this takes the same road
  // as Cmd+Q and the end of a window close: `before-quit` -> AppQuitCoordinator -> stop a running Host -> quit. No payload.
  ipcMain.handle(IPC_CHANNELS.quitExit, event => {
    if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
    quitController.approveApplicationQuit();
    app.quit();
  });
  ipcMain.handle(IPC_CHANNELS.openExternal, (event, rawUrl: unknown) => {
    if (!isSender(window, event) || typeof rawUrl !== 'string') throw new Error('Invalid IPC request.');
    return openExternalUrl(rawUrl, development);
  });

  let removeHostStatusListener: (() => void) | undefined;
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
    ipcMain.handle(IPC_CHANNELS.hostRefreshNetwork, (event, value: unknown) => {
      if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
      return services.hostRuntime.refreshNetwork(parseNetworkRefresh(value));
    });
    ipcMain.handle(IPC_CHANNELS.hostActivateOnline, async (event, value: unknown) => {
      if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
      const roomCode = parseFindRoomRequest(value);
      try {
        return { ok: true, status: await services.hostRuntime.activateOnlineRoom(roomCode) };
      } catch {
        return { ok: false, status: services.hostRuntime.status };
      }
    });
    ipcMain.handle(IPC_CHANNELS.onlineFindRoom, async (event, value: unknown) => {
      if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
      const roomCode = parseFindRoomRequest(value);
      try {
        const endpoint = await services.hostRuntime.resolveOnlineRoom(roomCode);
        return endpoint ? { ok: true, endpoint } : { ok: false, code: 'NOT_FOUND' };
      } catch {
        return { ok: false, code: 'UNAVAILABLE' };
      }
    });
    removeHostStatusListener = services.hostRuntime.onStatusChanged((status: HostRuntimeStatus) => {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.hostStatusChanged, status);
    });
  }

  const lanFinder = services?.lanFinder;
  if (lanFinder) {
    ipcMain.handle(IPC_CHANNELS.lanFindRoom, async (event, value: unknown): Promise<LanFindRoomResult> => {
      if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
      const roomCode = parseFindRoomRequest(value);
      try {
        return await lanFinder.findRoom(roomCode);
      } catch {
        return { ok: false, code: 'UNAVAILABLE' };
      }
    });
  }

  // None of the update channels takes a payload: the renderer chooses the next step, never a URL, a file or a version.
  const updateService = services?.updateService;
  let removeUpdateListener: (() => void) | undefined;
  if (updateService) {
    ipcMain.handle(IPC_CHANNELS.updateGetState, (event): AppUpdateState => {
      if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
      return updateService.getState();
    });
    ipcMain.handle(IPC_CHANNELS.updateCheck, (event): Promise<AppUpdateState> => {
      if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
      return updateService.checkForUpdates('manual');
    });
    // The download and the install run on; the answer is the state they started in, and every later state is pushed.
    ipcMain.handle(IPC_CHANNELS.updateDownload, (event): AppUpdateState => {
      if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
      void updateService.downloadUpdate();
      return updateService.getState();
    });
    ipcMain.handle(IPC_CHANNELS.updateCancel, (event): AppUpdateState => {
      if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
      return updateService.cancelDownload();
    });
    ipcMain.handle(IPC_CHANNELS.updateInstall, (event): AppUpdateState => {
      if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
      void updateService.installUpdate();
      return updateService.getState();
    });
    removeUpdateListener = updateService.onStateChanged(state => {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.updateStateChanged, state);
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
    removeUpdateListener?.();
    lanFinder?.cancel();
    ipcMain.removeHandler(IPC_CHANNELS.runtimeConfig);
    ipcMain.removeHandler(IPC_CHANNELS.windowGetState);
    ipcMain.removeHandler(IPC_CHANNELS.windowSetFullscreen);
    ipcMain.removeHandler(IPC_CHANNELS.windowToggleFullscreen);
    ipcMain.removeHandler(IPC_CHANNELS.quitExit);
    ipcMain.removeHandler(IPC_CHANNELS.openExternal);
    ipcMain.removeHandler(IPC_CHANNELS.hostGetStatus);
    ipcMain.removeHandler(IPC_CHANNELS.hostStart);
    ipcMain.removeHandler(IPC_CHANNELS.hostStop);
    ipcMain.removeHandler(IPC_CHANNELS.hostRefreshNetwork);
    ipcMain.removeHandler(IPC_CHANNELS.hostActivateOnline);
    ipcMain.removeHandler(IPC_CHANNELS.lanFindRoom);
    ipcMain.removeHandler(IPC_CHANNELS.onlineFindRoom);
    ipcMain.removeHandler(IPC_CHANNELS.updateGetState);
    ipcMain.removeHandler(IPC_CHANNELS.updateCheck);
    ipcMain.removeHandler(IPC_CHANNELS.updateDownload);
    ipcMain.removeHandler(IPC_CHANNELS.updateCancel);
    ipcMain.removeHandler(IPC_CHANNELS.updateInstall);
    ipcMain.removeAllListeners(IPC_CHANNELS.quitResponse);
  });
}
