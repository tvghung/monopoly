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
  | 'CLOUDFLARED_MISSING'
  | 'REGISTRY_UNAVAILABLE'
  | 'CODE_TAKEN'
  | 'ONLINE_FAILED'
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
  connectionMode?: 'LAN' | 'ONLINE';
  onlineEndpoint?: string | null;
  onlineState?: 'CONNECTING' | 'AWAITING_ROOM' | 'READY' | 'DISCOVERY_UNAVAILABLE' | 'UNAVAILABLE';
  errorCode?: HostRuntimeErrorCode;
  diagnostic?: string;
}

export type HostRuntimeOperationResult =
  | { ok: true; status: HostRuntimeStatus }
  | { ok: false; status: HostRuntimeStatus };

/** Why the Host of a room code could not be found on this network (the main process mirrors this type). */
export type LanFindRoomFailureCode = 'NOT_FOUND' | 'UNREACHABLE' | 'NO_NETWORK' | 'UNAVAILABLE';

export type LanFindRoomResult =
  | { ok: true; endpoint: string }
  | { ok: false; code: LanFindRoomFailureCode };

/**
 * The in-app update state, as the desktop main process publishes it (`apps/desktop/src/update/updateTypes.ts` is the
 * source; the renderer has no shared runtime package with it, the same split as `HostRuntimeStatus`). `phase` is the whole
 * story; `update` exists from `available` on, `progress` while downloading, `error` in the error phase.
 */
export type AppUpdatePhase =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'error';

export type AppUpdateStage = 'check' | 'download' | 'install';

export type AppUpdateErrorCode =
  | 'OFFLINE'
  | 'SERVER_ERROR'
  | 'TIMEOUT'
  | 'FEED_INVALID'
  | 'INTEGRITY'
  | 'DISK_SPACE'
  | 'DISK_WRITE'
  | 'INSTALL_FAILED'
  | 'INSTALL_START_FAILED'
  | 'UNKNOWN';

/** `restart`: installing relaunches the new version. `open-installer`: the installer is opened for the player to finish. */
export type AppUpdateInstallMode = 'restart' | 'open-installer';

export interface AppUpdateInfo {
  /** The release a check found, without a leading "v". */
  version: string;
  /** The running version is below the release's minimum supported version: multiplayer is blocked until it updates. */
  mandatory: boolean;
  sizeBytes: number;
}

export interface AppUpdateState {
  phase: AppUpdatePhase;
  currentVersion: string;
  update?: AppUpdateInfo;
  progress?: { receivedBytes: number; totalBytes: number };
  error?: { stage: AppUpdateStage; code: AppUpdateErrorCode };
  installMode: AppUpdateInstallMode;
  followUp?: 'installer-opened' | 'restart-manually';
  /** A fact only the main process knows that keeps an install from running now: a LAN room is open on this machine. */
  installBlocked?: 'HOST_OPEN';
  checkedAt?: number;
}

export interface DesktopLaunchSelection {
  runtimeConfig: DesktopRuntimeConfig;
  initialJoin?: { name: string; roomCode: string };
  targetRoomCode?: string;
  hosting: boolean;
  connectionMode?: 'LAN' | 'ONLINE';
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
    /** Quits the app now; the start screen's "Thoát" asks the player first. Absent on a bridge that predates it. */
    exitApp?(): Promise<void>;
  };
  openExternal(url: string): Promise<void>;
  host?: {
    getStatus(): Promise<HostRuntimeStatus>;
    start(options?: { port?: number; preferredAddress?: string; mode?: 'LAN' | 'ONLINE'; roomCode?: string }): Promise<HostRuntimeOperationResult>;
    stop(): Promise<HostRuntimeOperationResult>;
    activateOnline?(roomCode: string): Promise<HostRuntimeOperationResult>;
    refreshNetwork(options?: { preferredAddress?: string }): Promise<HostRuntimeStatus>;
    onStatusChanged(listener: (status: HostRuntimeStatus) => void): () => void;
  };
  lan?: {
    /** Looks for the Host of a room code on this network (a few seconds at most). */
    findRoom(roomCode: string): Promise<LanFindRoomResult>;
  };
  online?: {
    findRoom(roomCode: string): Promise<{ ok: true; endpoint: string } | { ok: false; code: 'NOT_FOUND' | 'UNAVAILABLE' }>;
  };
  /** The in-app updater; absent on a bridge that predates it. */
  update?: {
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

