import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type DesktopWindowState } from './ipc/channels';
import type { DesktopRuntimeConfigResult } from './runtimeConfig';
import type {
  HostRuntimeOperationResult,
  HostRuntimeStatus,
  HostStartOptions,
} from './hostRuntime';
import type { LanFindRoomResult } from './lanFinder';
import type { AppUpdateState } from './update/updateTypes';

export interface OwnTheBlockDesktopBridge {
  getRuntimeConfig(): Promise<DesktopRuntimeConfigResult>;
  window: {
    getState(): Promise<DesktopWindowState>;
    setFullscreen(value: boolean): Promise<void>;
    toggleFullscreen(): Promise<void>;
    onFullscreenChanged(listener: (state: DesktopWindowState) => void): () => void;
  };
  quit: {
    onQuitRequested(listener: (requestId: string) => void): () => void;
    respond(requestId: string, allowQuit: boolean): void;
    /** Quits the app now (the start screen's "Thoát", after the player confirmed); a running Host is stopped on the way. */
    exitApp(): Promise<void>;
  };
  openExternal(url: string): Promise<void>;
  host: {
    getStatus(): Promise<HostRuntimeStatus>;
    start(options?: HostStartOptions): Promise<HostRuntimeOperationResult>;
    stop(): Promise<HostRuntimeOperationResult>;
    refreshNetwork(options?: { preferredAddress?: string }): Promise<HostRuntimeStatus>;
    onStatusChanged(listener: (status: HostRuntimeStatus) => void): () => void;
    activateOnline(roomCode: string): Promise<HostRuntimeOperationResult>;
  };
  lan: {
    /** Finds the Host of a room code on this network; resolves with its endpoint or the reason it was not found. */
    findRoom(roomCode: string): Promise<LanFindRoomResult>;
  };
  online: {
    findRoom(roomCode: string): Promise<{ ok: true; endpoint: string; instanceId?: string } | { ok: false; code: 'NOT_FOUND' | 'UNAVAILABLE' }>;
  };
  update: {
    getState(): Promise<AppUpdateState>;
    /** Looks for a newer release now; resolves with the state once the look is over. */
    check(): Promise<AppUpdateState>;
    /** Starts downloading the update that was found; progress arrives through `onStateChanged`. */
    download(): Promise<AppUpdateState>;
    cancelDownload(): Promise<AppUpdateState>;
    /** Applies a downloaded update: restarts into the new version, or opens its installer (see `installMode`). */
    install(): Promise<AppUpdateState>;
    onStateChanged(listener: (state: AppUpdateState) => void): () => void;
  };
}

const bridge: OwnTheBlockDesktopBridge = {
  getRuntimeConfig: () => ipcRenderer.invoke(IPC_CHANNELS.runtimeConfig),
  window: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.windowGetState),
    setFullscreen: value => ipcRenderer.invoke(IPC_CHANNELS.windowSetFullscreen, value),
    toggleFullscreen: () => ipcRenderer.invoke(IPC_CHANNELS.windowToggleFullscreen),
    onFullscreenChanged: listener => {
      const handler = (_event: Electron.IpcRendererEvent, state: DesktopWindowState) => listener(state);
      ipcRenderer.on(IPC_CHANNELS.windowFullscreenChanged, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.windowFullscreenChanged, handler);
    },
  },
  quit: {
    onQuitRequested: listener => {
      const handler = (_event: Electron.IpcRendererEvent, requestId: string) => listener(requestId);
      ipcRenderer.on(IPC_CHANNELS.quitRequested, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.quitRequested, handler);
    },
    respond: (requestId, allowQuit) => {
      ipcRenderer.send(IPC_CHANNELS.quitResponse, requestId, allowQuit);
    },
    exitApp: () => ipcRenderer.invoke(IPC_CHANNELS.quitExit),
  },
  openExternal: url => ipcRenderer.invoke(IPC_CHANNELS.openExternal, url),
  host: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.hostGetStatus),
    start: options => ipcRenderer.invoke(IPC_CHANNELS.hostStart, options),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.hostStop),
    refreshNetwork: options => ipcRenderer.invoke(IPC_CHANNELS.hostRefreshNetwork, options),
    onStatusChanged: listener => {
      const handler = (_event: Electron.IpcRendererEvent, status: HostRuntimeStatus) => listener(status);
      ipcRenderer.on(IPC_CHANNELS.hostStatusChanged, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.hostStatusChanged, handler);
    },
    activateOnline: roomCode => ipcRenderer.invoke(IPC_CHANNELS.hostActivateOnline, { roomCode }),
  },
  lan: {
    findRoom: roomCode => ipcRenderer.invoke(IPC_CHANNELS.lanFindRoom, { roomCode }),
  },
  online: {
    findRoom: roomCode => ipcRenderer.invoke(IPC_CHANNELS.onlineFindRoom, { roomCode }),
  },
  update: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.updateGetState),
    check: () => ipcRenderer.invoke(IPC_CHANNELS.updateCheck),
    download: () => ipcRenderer.invoke(IPC_CHANNELS.updateDownload),
    cancelDownload: () => ipcRenderer.invoke(IPC_CHANNELS.updateCancel),
    install: () => ipcRenderer.invoke(IPC_CHANNELS.updateInstall),
    onStateChanged: listener => {
      const handler = (_event: Electron.IpcRendererEvent, state: AppUpdateState) => listener(state);
      ipcRenderer.on(IPC_CHANNELS.updateStateChanged, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.updateStateChanged, handler);
    },
  },
};

contextBridge.exposeInMainWorld('ownTheBlockDesktop', bridge);

