import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type DesktopWindowState } from './ipc/channels';
import type { DesktopRuntimeConfigResult } from './runtimeConfig';

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
};

contextBridge.exposeInMainWorld('ownTheBlockDesktop', bridge);

