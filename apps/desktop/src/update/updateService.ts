import { DownloadError, downloadVerifiedFile } from './downloader';
import { openResponse, readTextLimited, UpdateHttpError } from './http';
import type { UpdateInstaller } from './installers';
import {
  isMandatoryUpdate,
  MAX_MANIFEST_BYTES,
  parseUpdateManifest,
  selectAsset,
  UpdateManifestError,
  type UpdateAsset,
  type UpdateManifest,
} from './manifest';
import { freeDiskBytes, pruneStagedUpdates, stagedFilePath, verifyStagedFile } from './stagedFiles';
import {
  DOWNLOAD_HEADROOM_BYTES,
  MANIFEST_TIMEOUT_MS,
  PERIODIC_CHECK_INTERVAL_MS,
  STARTUP_CHECK_DELAY_MS,
  type UpdateEndpoints,
} from './updateConfig';
import type {
  AppUpdateController,
  AppUpdateErrorCode,
  AppUpdateInfo,
  AppUpdateListener,
  AppUpdateState,
  AppUpdateStage,
  AppUpdateTrigger,
} from './updateTypes';
import { compareVersions, isValidVersion } from './version';

export interface UpdateTiming {
  startupDelayMs: number;
  periodicIntervalMs: number;
  manifestTimeoutMs: number;
  /** Progress events are at most this far apart (the last one, at 100 %, always goes out). */
  progressIntervalMs: number;
  /** After the app asked to quit for an update, how long it waits before it tells the player to restart by hand. */
  quitWatchdogMs: number;
  connectTimeoutMs?: number;
  stallTimeoutMs?: number;
}

const DEFAULT_TIMING: UpdateTiming = {
  startupDelayMs: STARTUP_CHECK_DELAY_MS,
  periodicIntervalMs: PERIODIC_CHECK_INTERVAL_MS,
  manifestTimeoutMs: MANIFEST_TIMEOUT_MS,
  progressIntervalMs: 200,
  quitWatchdogMs: 30_000,
};

export interface UpdateServiceOptions {
  /** `app.getVersion()`. */
  currentVersion: string;
  platform: string;
  architecture: string;
  /** Without them (a development run without a feed, an unsupported platform) the service reports `unsupported`. */
  endpoints: UpdateEndpoints | undefined;
  installer: UpdateInstaller | undefined;
  updatesDirectory: string;
  fetch: typeof globalThis.fetch;
  /** True while a LAN room is open on this machine: restarting would close it for everyone in it. */
  isHostBusy(): boolean;
  /** Quits the app as the player's own quit does, without asking a second question. */
  requestQuit(): void;
  now?(): number;
  freeDiskBytes?(directory: string): Promise<number | undefined>;
  timing?: Partial<UpdateTiming>;
  log?(message: string, error?: unknown): void;
}

interface UpdateTarget {
  manifest: UpdateManifest;
  asset: UpdateAsset;
  filePath: string;
  info: AppUpdateInfo;
}

/** A published state is everything the service decides; the rest (version, mode, timestamps) is added by `publish`. */
type Published = Pick<AppUpdateState, 'phase' | 'update' | 'progress' | 'error' | 'followUp'>;

class UpdateFailure extends Error {
  public constructor(public readonly code: AppUpdateErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UpdateFailure';
  }
}

const HTTP_CODES: Record<UpdateHttpError['code'], AppUpdateErrorCode> = {
  NETWORK: 'OFFLINE',
  HTTP_STATUS: 'SERVER_ERROR',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'UNKNOWN',
  UNTRUSTED_URL: 'SERVER_ERROR',
  TOO_LARGE: 'FEED_INVALID',
};

function toErrorCode(error: unknown): AppUpdateErrorCode {
  if (error instanceof UpdateFailure) return error.code;
  if (error instanceof DownloadError) {
    return error.code === 'INTEGRITY' || error.code === 'DISK_SPACE' || error.code === 'DISK_WRITE'
      ? error.code
      : HTTP_CODES[error.code];
  }
  if (error instanceof UpdateHttpError) return HTTP_CODES[error.code];
  // The feed was fetched but is not JSON, or is not the manifest this app understands.
  if (error instanceof UpdateManifestError || error instanceof SyntaxError || error instanceof TypeError) return 'FEED_INVALID';
  return 'UNKNOWN';
}

/**
 * Looks for a newer release, downloads its installer and applies it. It owns the update state; the renderer only reads
 * it (through the preload bridge) and asks for the next step. Nothing here decides *when* a restart is welcome beyond what
 * the main process itself knows (an open LAN room): the renderer, which knows whether a player is in a lobby or a game,
 * only offers the restart on the start screen.
 *
 * A failed or impossible update never gets in the way of playing: every failure becomes a state, no method rejects, and
 * a check that cannot reach the feed leaves the app exactly as it was (a "mandatory" update is only known once a feed has
 * been read, so a LAN party without Internet is never locked out; the server already refuses an incompatible protocol).
 */
export class UpdateService implements AppUpdateController {
  private readonly timing: UpdateTiming;
  private readonly current: string;
  private readonly enabled: boolean;
  private readonly listeners = new Set<AppUpdateListener>();

  private state: AppUpdateState;
  private lastEmitted: AppUpdateState | undefined;
  private lastCheckedAt: number | undefined;
  private target: UpdateTarget | undefined;
  private lastProgressAt = 0;

  private activeCheck: Promise<AppUpdateState> | undefined;
  private activeDownload: { promise: Promise<AppUpdateState>; abort: AbortController } | undefined;
  private activeInstall: Promise<AppUpdateState> | undefined;

  private startupTimer: NodeJS.Timeout | undefined;
  private periodicTimer: NodeJS.Timeout | undefined;
  private watchdogTimer: NodeJS.Timeout | undefined;
  private started = false;
  private disposed = false;

  public constructor(private readonly options: UpdateServiceOptions) {
    this.timing = { ...DEFAULT_TIMING, ...options.timing };
    this.current = options.currentVersion;
    this.enabled = Boolean(options.endpoints && options.installer && isValidVersion(options.currentVersion));
    this.state = this.compose({ phase: this.enabled ? 'idle' : 'unsupported' });
  }

  public getState(): AppUpdateState {
    return this.snapshot();
  }

  public onStateChanged(listener: AppUpdateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Starts the scheduled checks and cleans up what an earlier run left behind. Safe to call more than once. */
  public start(): void {
    if (!this.enabled || this.started || this.disposed) return;
    this.started = true;
    // An installer for the running version or an older one has done its job; whatever is newer may still be wanted.
    void pruneStagedUpdates(this.options.updatesDirectory, version => compareVersions(version, this.current) > 0);
    this.startupTimer = setTimeout(() => {
      void this.checkForUpdates('startup');
    }, this.timing.startupDelayMs);
    this.periodicTimer = setInterval(() => {
      void this.checkForUpdates('periodic');
    }, this.timing.periodicIntervalMs);
    this.startupTimer.unref();
    this.periodicTimer.unref();
  }

  public dispose(): void {
    this.disposed = true;
    clearTimeout(this.startupTimer);
    clearInterval(this.periodicTimer);
    clearTimeout(this.watchdogTimer);
    this.activeDownload?.abort.abort();
    this.listeners.clear();
  }

  /** Call when the main process learns something that changes whether an install may run (a room opened or closed). */
  public refreshSafety(): void {
    if (this.disposed) return;
    if (this.snapshot().installBlocked !== this.lastEmitted?.installBlocked) this.emit();
  }

  public checkForUpdates(trigger: AppUpdateTrigger): Promise<AppUpdateState> {
    if (!this.enabled || this.disposed) return Promise.resolve(this.snapshot());
    if (this.activeCheck) return this.activeCheck;
    if (!this.mayCheck()) return Promise.resolve(this.snapshot());
    const run = this.runCheck(trigger).finally(() => {
      this.activeCheck = undefined;
    });
    this.activeCheck = run;
    return run;
  }

  public downloadUpdate(): Promise<AppUpdateState> {
    if (this.activeDownload) return this.activeDownload.promise;
    const { target } = this;
    const { phase, error } = this.state;
    const mayDownload = phase === 'available' || (phase === 'error' && error?.stage === 'download');
    if (!this.enabled || this.disposed || !target || !mayDownload) return Promise.resolve(this.snapshot());
    const abort = new AbortController();
    const promise = this.runDownload(target, abort.signal).finally(() => {
      this.activeDownload = undefined;
    });
    this.activeDownload = { promise, abort };
    return promise;
  }

  public cancelDownload(): AppUpdateState {
    this.activeDownload?.abort.abort();
    return this.snapshot();
  }

  public installUpdate(): Promise<AppUpdateState> {
    if (this.activeInstall) return this.activeInstall;
    const { target } = this;
    const { phase, error } = this.state;
    const mayInstall = phase === 'ready' || (phase === 'error' && error?.stage === 'install');
    if (!this.enabled || this.disposed || !target || !mayInstall) return Promise.resolve(this.snapshot());
    // A restart would close a LAN room for everyone in it: not now. The snapshot says why.
    if (this.installBlocked()) {
      this.refreshSafety();
      return Promise.resolve(this.snapshot());
    }
    const run = this.runInstall(target).finally(() => {
      this.activeInstall = undefined;
    });
    this.activeInstall = run;
    return run;
  }

  private get installMode(): AppUpdateState['installMode'] {
    return this.options.installer?.mode ?? 'restart';
  }

  private compose(published: Published): AppUpdateState {
    return {
      ...published,
      currentVersion: this.current,
      installMode: this.installMode,
      ...(this.lastCheckedAt === undefined ? {} : { checkedAt: this.lastCheckedAt }),
    };
  }

  private publish(published: Published): void {
    if (this.disposed) return;
    this.state = this.compose(published);
    this.emit();
  }

  private installBlocked(): boolean {
    return this.installMode === 'restart' && this.options.isHostBusy();
  }

  private snapshot(): AppUpdateState {
    const { phase, error } = this.state;
    // The player can press "install" in both of these states (the second is the retry after a failed install).
    const installable = phase === 'ready' || (phase === 'error' && error?.stage === 'install');
    return installable && this.installBlocked()
      ? { ...this.state, installBlocked: 'HOST_OPEN' }
      : { ...this.state };
  }

  private emit(): void {
    const snapshot = this.snapshot();
    this.lastEmitted = snapshot;
    for (const listener of [...this.listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        this.log('An update listener failed.', error);
      }
    }
  }

  private log(message: string, error?: unknown): void {
    if (this.options.log) this.options.log(message, error);
    else console.warn(message, error ?? '');
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  /** A known update is in the hands of the player (or a retry); only an idle app looks for a new one. */
  private mayCheck(): boolean {
    const { phase, error } = this.state;
    return phase === 'idle' || phase === 'up-to-date' || (phase === 'error' && error?.stage === 'check');
  }

  private async fetchManifest(): Promise<UpdateManifest> {
    const { endpoints } = this.options;
    if (!endpoints) throw new UpdateFailure('UNKNOWN', 'No update endpoints.');
    // One deadline for the whole read, headers and body: a manifest is a few hundred bytes.
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timing.manifestTimeoutMs);
    try {
      const opened = await openResponse({
        url: endpoints.manifestUrl,
        fetch: this.options.fetch,
        isUrlAllowed: endpoints.isUrlAllowed,
        signal: controller.signal,
        timeoutMs: this.timing.manifestTimeoutMs,
        accept: 'application/json',
      });
      try {
        const text = await readTextLimited(opened, MAX_MANIFEST_BYTES);
        return parseUpdateManifest(JSON.parse(text) as unknown);
      } finally {
        opened.dispose();
      }
    } catch (error) {
      if (timedOut) throw new UpdateFailure('TIMEOUT', 'The update feed did not answer in time.', { cause: error });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async runCheck(trigger: AppUpdateTrigger): Promise<AppUpdateState> {
    this.publish({ phase: 'checking' });
    try {
      const manifest = await this.fetchManifest();
      this.lastCheckedAt = this.now();
      // Only the release in the feed (and nothing at or below the running version) can still be wanted on disk.
      void pruneStagedUpdates(this.options.updatesDirectory, version => version === manifest.version
        && compareVersions(version, this.current) > 0);

      if (compareVersions(manifest.version, this.current) <= 0) {
        this.target = undefined;
        this.publish({ phase: 'up-to-date' });
        return this.snapshot();
      }
      const asset = selectAsset(manifest, this.options.platform, this.options.architecture);
      // A newer release that has no installer for this machine cannot be offered.
      if (!asset) throw new UpdateFailure('FEED_INVALID', 'The newest release has no installer for this platform.');

      const info: AppUpdateInfo = {
        version: manifest.version,
        mandatory: isMandatoryUpdate(this.current, manifest),
        sizeBytes: asset.size,
      };
      const filePath = stagedFilePath(this.options.updatesDirectory, manifest.version, asset.name);
      this.target = { manifest, asset, filePath, info };
      // "Để sau" on an earlier run left the verified installer behind: no second download.
      const staged = await verifyStagedFile(filePath, asset);
      this.publish({ phase: staged ? 'ready' : 'available', update: info });
    } catch (error) {
      this.target = undefined;
      const code = toErrorCode(error);
      // A background check that finds no Internet is not news; the log keeps the reason, the state keeps the code.
      this.log(`The ${trigger} update check failed (${code}).`, error);
      this.publish({ phase: 'error', error: { stage: 'check', code } });
    }
    return this.snapshot();
  }

  private reportProgress(received: number, total: number, update: AppUpdateInfo): void {
    if (this.state.phase !== 'downloading') return;
    const at = this.now();
    if (received < total && at - this.lastProgressAt < this.timing.progressIntervalMs) return;
    this.lastProgressAt = at;
    this.publish({ phase: 'downloading', update, progress: { receivedBytes: received, totalBytes: total } });
  }

  private async runDownload(target: UpdateTarget, signal: AbortSignal): Promise<AppUpdateState> {
    const { asset, info } = target;
    const { endpoints } = this.options;
    this.lastProgressAt = this.now();
    this.publish({ phase: 'downloading', update: info, progress: { receivedBytes: 0, totalBytes: asset.size } });
    try {
      if (!endpoints) throw new UpdateFailure('UNKNOWN', 'No update endpoints.');
      const free = await (this.options.freeDiskBytes ?? freeDiskBytes)(this.options.updatesDirectory);
      if (free !== undefined && free < asset.size + DOWNLOAD_HEADROOM_BYTES) {
        throw new UpdateFailure('DISK_SPACE', 'There is not enough free disk space for the update.');
      }
      await downloadVerifiedFile({
        url: endpoints.assetUrl(target.manifest.version, asset.name),
        destination: target.filePath,
        size: asset.size,
        sha256: asset.sha256,
        fetch: this.options.fetch,
        isUrlAllowed: endpoints.isUrlAllowed,
        signal,
        onProgress: received => this.reportProgress(received, asset.size, info),
        ...(this.timing.connectTimeoutMs === undefined ? {} : { connectTimeoutMs: this.timing.connectTimeoutMs }),
        ...(this.timing.stallTimeoutMs === undefined ? {} : { stallTimeoutMs: this.timing.stallTimeoutMs }),
      });
      this.publish({ phase: 'ready', update: info });
    } catch (error) {
      if (error instanceof DownloadError && error.code === 'CANCELLED') {
        this.publish({ phase: 'available', update: info });
      } else {
        const code = toErrorCode(error);
        this.log(`The update download failed (${code}).`, error);
        this.publish({ phase: 'error', update: info, error: { stage: 'download', code } });
      }
    }
    return this.snapshot();
  }

  private fail(update: AppUpdateInfo, stage: AppUpdateStage, code: AppUpdateErrorCode): void {
    this.publish({ phase: 'error', update, error: { stage, code } });
  }

  private async runInstall(target: UpdateTarget): Promise<AppUpdateState> {
    const { asset, info, filePath } = target;
    const { installer } = this.options;
    this.publish({ phase: 'installing', update: info });
    try {
      // The file sat on disk since it was verified: make sure it is still exactly that file before it is run.
      if (!(await verifyStagedFile(filePath, asset))) {
        this.fail(info, 'download', 'INTEGRITY');
        return this.snapshot();
      }
      if (!installer) throw new UpdateFailure('INSTALL_START_FAILED', 'No installer for this platform.');
      const outcome = await installer.install(filePath);
      if (!outcome.ok) {
        this.log(`The update installer failed (${outcome.code}).`);
        this.fail(info, 'install', outcome.code);
      } else if (outcome.quit) {
        // The new version is installed and starts when this process has exited (the state stays "installing"). If the app
        // does not go away, the player is told to restart it by hand.
        this.watchdogTimer = setTimeout(() => {
          this.publish({ phase: 'ready', update: info, followUp: 'restart-manually' });
        }, this.timing.quitWatchdogMs);
        this.watchdogTimer.unref();
        this.options.requestQuit();
      } else {
        this.publish({ phase: 'ready', update: info, followUp: 'installer-opened' });
      }
    } catch (error) {
      this.log('The update installer threw.', error);
      const code = toErrorCode(error);
      this.fail(info, 'install', code === 'UNKNOWN' ? 'INSTALL_FAILED' : code);
    }
    return this.snapshot();
  }
}
