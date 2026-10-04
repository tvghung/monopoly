/**
 * The in-app update state. The main process owns it (`UpdateService`), the preload bridge hands it to the renderer, and
 * `apps/client/src/runtime/types.ts` repeats these types for the renderer (the main process has no shared runtime
 * package, the same split as `HostRuntimeStatus`).
 *
 * `phase` is the whole story; the other fields only qualify it:
 *
 * - `update` exists from `available` on, through `downloading`, `ready`, `installing` and a failed download or install.
 *   A failed check never carries one: the app only knows about a newer release once a check has read the feed.
 * - `progress` exists in `downloading`.
 * - `error` exists in `error`; `stage` says which step failed so the screen can offer the right retry.
 */
export type AppUpdatePhase =
  /** No update channel here (a development run without a feed, or an unsupported platform). */
  | 'unsupported'
  /** Nothing has been checked yet. */
  | 'idle'
  | 'checking'
  /** The newest release is the running version. */
  | 'up-to-date'
  /** A newer release exists and nothing has been downloaded. */
  | 'available'
  | 'downloading'
  /** The installer is downloaded and verified; applying it is the player's choice. */
  | 'ready'
  | 'installing'
  | 'error';

export type AppUpdateStage = 'check' | 'download' | 'install';

/** What went wrong, coarse enough that each value has one plain sentence for the player. */
export type AppUpdateErrorCode =
  /** The update server could not be reached. */
  | 'OFFLINE'
  /** The server answered with something unusable (a status, or a file on an untrusted host). */
  | 'SERVER_ERROR'
  | 'TIMEOUT'
  /** The feed was unreadable, or lists nothing for this platform. */
  | 'FEED_INVALID'
  /** The downloaded file did not match its recorded size or checksum. */
  | 'INTEGRITY'
  | 'DISK_SPACE'
  | 'DISK_WRITE'
  /** The installer ran and failed, or did not finish in time. */
  | 'INSTALL_FAILED'
  /** The installer could not be started or opened. */
  | 'INSTALL_START_FAILED'
  | 'UNKNOWN';

/**
 * What applying a downloaded update does: `restart` installs it and relaunches the new version (Windows installed by the
 * Squirrel installer); `open-installer` opens the installer for the player to finish (macOS, whose builds are not signed and
 * so cannot be replaced in place, and a Windows copy that was not installed by the installer).
 */
export type AppUpdateInstallMode = 'restart' | 'open-installer';

/** After `install` in the `open-installer` mode (or an install the app could not restart after), what the player does next. */
export type AppUpdateFollowUp = 'installer-opened' | 'restart-manually';

export interface AppUpdateInfo {
  /** The release a check found, without a leading "v". */
  version: string;
  /** The running version is below the release's minimum supported version: starting or joining multiplayer is blocked. */
  mandatory: boolean;
  /** Size of the installer to download. */
  sizeBytes: number;
}

export interface AppUpdateProgress {
  receivedBytes: number;
  totalBytes: number;
}

export interface AppUpdateState {
  phase: AppUpdatePhase;
  /** The running version (`app.getVersion()`). */
  currentVersion: string;
  update?: AppUpdateInfo;
  progress?: AppUpdateProgress;
  error?: { stage: AppUpdateStage; code: AppUpdateErrorCode };
  installMode: AppUpdateInstallMode;
  followUp?: AppUpdateFollowUp;
  /** A fact only the main process knows that keeps `install` from running now: a LAN room is open on this machine. */
  installBlocked?: 'HOST_OPEN';
  /** When the last check finished (epoch milliseconds). */
  checkedAt?: number;
}

export type AppUpdateTrigger = 'startup' | 'periodic' | 'manual';

export type AppUpdateListener = (state: AppUpdateState) => void;

/** What the IPC layer needs from the update service (the same surface a test double implements). */
export interface AppUpdateController {
  getState(): AppUpdateState;
  onStateChanged(listener: AppUpdateListener): () => void;
  checkForUpdates(trigger: AppUpdateTrigger): Promise<AppUpdateState>;
  downloadUpdate(): Promise<AppUpdateState>;
  cancelDownload(): AppUpdateState;
  installUpdate(): Promise<AppUpdateState>;
}
