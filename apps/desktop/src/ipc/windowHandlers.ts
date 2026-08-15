import { randomUUID } from 'node:crypto';
import { ipcMain, type BrowserWindow, type WebContents } from 'electron';
import { getDesktopRuntimeConfig } from '../runtimeConfig';
import { openExternalUrl } from './externalLinks';
import { IPC_CHANNELS, isQuitRequestId, type DesktopWindowState } from './channels';

const QUIT_RESPONSE_TIMEOUT_MS = 2_000;

interface CloseEventLike {
  preventDefault(): void;
}

export class QuitRequestController {
  private pendingRequestId: string | null = null;
  private allowNextClose = false;
  private timeout: NodeJS.Timeout | null = null;

  public constructor(private readonly window: BrowserWindow) {}

  public handleClose(event: CloseEventLike): void {
    if (this.allowNextClose) {
      this.allowNextClose = false;
      return;
    }

    event.preventDefault();
    if (this.pendingRequestId || this.window.isDestroyed()) return;

    const requestId = randomUUID();
    this.pendingRequestId = requestId;
    try {
      this.window.webContents.send(IPC_CHANNELS.quitRequested, requestId);
    } catch {
      this.allowAndClose(requestId);
      return;
    }
    this.timeout = setTimeout(() => this.allowAndClose(requestId), QUIT_RESPONSE_TIMEOUT_MS);
  }

  public respond(requestId: string, allowQuit: boolean): void {
    if (requestId !== this.pendingRequestId) return;
    this.clearPending();
    if (allowQuit) this.allowAndClose(requestId);
  }

  public dispose(): void {
    this.clearPending();
    this.pendingRequestId = null;
  }

  private allowAndClose(requestId: string): void {
    if (requestId !== this.pendingRequestId && this.pendingRequestId !== null) return;
    this.clearPending();
    if (this.window.isDestroyed()) return;
    this.allowNextClose = true;
    this.window.close();
  }

  private clearPending(): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
    this.pendingRequestId = null;
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

export function registerWindowHandlers(
  window: BrowserWindow,
  development: boolean,
  quitController: QuitRequestController,
): void {
  const runtimeConfig = getDesktopRuntimeConfig();

  ipcMain.handle(IPC_CHANNELS.runtimeConfig, event => {
    if (!isSender(window, event)) throw new Error('Invalid IPC sender.');
    return runtimeConfig;
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

  const sendFullscreenState = () => {
    if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.windowFullscreenChanged, getWindowState(window));
  };
  window.on('enter-full-screen', sendFullscreenState);
  window.on('leave-full-screen', sendFullscreenState);
  window.on('closed', () => {
    quitController.dispose();
    ipcMain.removeHandler(IPC_CHANNELS.runtimeConfig);
    ipcMain.removeHandler(IPC_CHANNELS.windowGetState);
    ipcMain.removeHandler(IPC_CHANNELS.windowSetFullscreen);
    ipcMain.removeHandler(IPC_CHANNELS.windowToggleFullscreen);
    ipcMain.removeHandler(IPC_CHANNELS.openExternal);
    ipcMain.removeAllListeners(IPC_CHANNELS.quitResponse);
  });
}
