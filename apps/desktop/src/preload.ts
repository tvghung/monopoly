import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type DesktopWindowState } from './ipc/channels';
import type { DesktopRuntimeConfigResult } from './runtimeConfig';
import type {
  HostRuntimeOperationResult,
  HostRuntimeStatus,
  HostStartOptions,
} from './hostRuntime';
import type {
  DiscoveryOperationResult,
  DiscoveredLanGame,
} from './lanDiscovery';
import type { NetworkInterfaceCandidate } from './networkInterfaces';

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
  };
  openExternal(url: string): Promise<void>;
  host: {
    getStatus(): Promise<HostRuntimeStatus>;
    start(options?: HostStartOptions): Promise<HostRuntimeOperationResult>;
    stop(): Promise<HostRuntimeOperationResult>;
    onStatusChanged(listener: (status: HostRuntimeStatus) => void): () => void;
  };
  lan: {
    getInterfaces(): Promise<NetworkInterfaceCandidate[]>;
  };
  discovery: {
    startBrowsing(): Promise<DiscoveryOperationResult>;
    stopBrowsing(): Promise<void>;
    getGames(): Promise<DiscoveredLanGame[]>;
    onGamesChanged(listener: (games: DiscoveredLanGame[]) => void): () => void;
    startAdvertising(options: { roomCode: string }): Promise<DiscoveryOperationResult>;
    stopAdvertising(): Promise<void>;
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
  },
  openExternal: url => ipcRenderer.invoke(IPC_CHANNELS.openExternal, url),
  host: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.hostGetStatus),
    start: options => ipcRenderer.invoke(IPC_CHANNELS.hostStart, options),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.hostStop),
    onStatusChanged: listener => {
      const handler = (_event: Electron.IpcRendererEvent, status: HostRuntimeStatus) => listener(status);
      ipcRenderer.on(IPC_CHANNELS.hostStatusChanged, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.hostStatusChanged, handler);
    },
  },
  lan: {
    getInterfaces: () => ipcRenderer.invoke(IPC_CHANNELS.lanGetInterfaces),
  },
  discovery: {
    startBrowsing: () => ipcRenderer.invoke(IPC_CHANNELS.discoveryStartBrowsing),
    stopBrowsing: () => ipcRenderer.invoke(IPC_CHANNELS.discoveryStopBrowsing),
    getGames: () => ipcRenderer.invoke(IPC_CHANNELS.discoveryGetGames),
    onGamesChanged: listener => {
      const handler = (_event: Electron.IpcRendererEvent, games: DiscoveredLanGame[]) => listener(games);
      ipcRenderer.on(IPC_CHANNELS.discoveryGamesChanged, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.discoveryGamesChanged, handler);
    },
    startAdvertising: options => ipcRenderer.invoke(IPC_CHANNELS.discoveryStartAdvertising, options),
    stopAdvertising: () => ipcRenderer.invoke(IPC_CHANNELS.discoveryStopAdvertising),
  },
};

contextBridge.exposeInMainWorld('ownTheBlockDesktop', bridge);

