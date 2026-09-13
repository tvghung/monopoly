export type RuntimeTarget = 'web' | 'desktop';
export type DesktopPlatform = 'win32' | 'darwin' | 'linux';

export interface RuntimeConfig {
  target: RuntimeTarget;
  socketUrl?: string;
  platform?: DesktopPlatform;
  appVersion?: string;
}

export type DesktopRuntimeConfigErrorCode =
  | 'SOCKET_URL_INVALID';

export type HostRuntimeState =
  | 'IDLE'
  | 'STARTING_POSTGRES'
  | 'STARTING_SERVER'
  | 'READY'
  | 'HOSTING'
  | 'STOPPING'
  | 'FAILED';

export type HostRuntimeErrorCode =
  | 'POSTGRES_RESOURCES_MISSING'
  | 'POSTGRES_INITIALIZATION_FAILED'
  | 'MIGRATION_FAILED'
  | 'HELPER_FAILED'
  | 'READINESS_TIMEOUT'
  | 'PORT_OCCUPIED'
  | 'BIND_DENIED'
  | 'NO_LAN_INTERFACE'
  | 'RUNTIME_FAILED';

export interface NetworkInterfaceCandidate {
  name: string;
  displayName: string;
  address: string;
  netmask: string;
  preference: 'preferred' | 'fallback';
  rank: number;
}

export interface HostRuntimeStatus {
  state: HostRuntimeState;
  platform: DesktopPlatform;
  appVersion: string;
  gamePort: number | null;
  localEndpoint: string | null;
  lanAvailable: boolean;
  interfaces: NetworkInterfaceCandidate[];
  advertisedEndpoints: string[];
  selectedLanUrl: string | null;
  errorCode?: HostRuntimeErrorCode;
  diagnostic?: string;
}

export type HostRuntimeOperationResult =
  | { ok: true; status: HostRuntimeStatus }
  | { ok: false; status: HostRuntimeStatus };

export interface DesktopLaunchSelection {
  runtimeConfig: DesktopRuntimeConfig;
  initialJoin?: { name: string; roomCode: string };
  targetRoomCode?: string;
  hosting: boolean;
}

export interface DesktopRuntimeConfig extends RuntimeConfig {
  target: 'desktop';
  socketUrl?: string;
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
  host?: {
    getStatus(): Promise<HostRuntimeStatus>;
    start(options?: { port?: number; preferredAddress?: string }): Promise<HostRuntimeOperationResult>;
    stop(): Promise<HostRuntimeOperationResult>;
    refreshNetwork(options?: { preferredAddress?: string }): Promise<HostRuntimeStatus>;
    onStatusChanged(listener: (status: HostRuntimeStatus) => void): () => void;
  };
}

