export type RuntimeTarget = 'web' | 'desktop';
export type DesktopPlatform = 'win32' | 'darwin' | 'linux';

export interface RuntimeConfig {
  target: RuntimeTarget;
  socketUrl?: string;
  platform?: DesktopPlatform;
  appVersion?: string;
}

export type DesktopRuntimeConfigErrorCode =
  | 'PACKAGED_SOCKET_URL_MISSING'
  | 'SOCKET_URL_INVALID';

export interface DesktopRuntimeConfig extends RuntimeConfig {
  target: 'desktop';
  socketUrl: string;
  platform: DesktopPlatform;
  appVersion: string;
}

export type DesktopRuntimeConfigResult =
  | { ok: true; config: DesktopRuntimeConfig }
  | { ok: false; code: DesktopRuntimeConfigErrorCode };

export interface DesktopWindowState {
  fullscreen: boolean;
  maximized: boolean;
  resizable: boolean;
}

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

