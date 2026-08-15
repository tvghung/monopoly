export type RuntimeTarget = 'web' | 'desktop';
export type DesktopPlatform = 'win32' | 'darwin' | 'linux';

export interface RuntimeConfig {
  target: RuntimeTarget;
  socketUrl?: string;
  platform?: DesktopPlatform;
  appVersion?: string;
}

export interface DesktopWindowState {
  fullscreen: boolean;
  maximized: boolean;
  resizable: boolean;
}

export interface OwnTheBlockDesktopBridge {
  getRuntimeConfig(): Promise<RuntimeConfig & { target: 'desktop' }>;
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

