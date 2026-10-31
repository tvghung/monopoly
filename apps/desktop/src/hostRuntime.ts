import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { CloudflareQuickTunnel, type ConnectivityProvider } from './online/connectivity';
import { classifyNetworkException, OnlineProbeError, probePublicTunnel,
  type OnlineDiagnostic, type OnlineFailure, type OnlineFetcher, type OnlineStage } from './online/probe';
import type { OnlineHostResolver } from './online/probe';
import { HttpRoomDiscovery, type RoomDiscoveryProvider } from './online/discovery';

import {
  ServerHelperController,
  type ServerHelperInfo,
  type ServerHelperState,
} from './serverHelper';
import {
  advertisedEndpoints,
  resolveNetworkInterfaces,
  type NetworkInterfaceCandidate,
} from './networkInterfaces';

export type HostRuntimeState =
  | 'IDLE'
  | 'STARTING_SERVER'
  | 'READY'
  | 'HOSTING'
  | 'STOPPING'
  | 'FAILED';

export type HostRuntimeErrorCode =
  | 'CLOUDFLARED_MISSING'
  | 'CLOUDFLARED_CORRUPT'
  | 'REGISTRY_UNAVAILABLE'
  | 'CODE_TAKEN'
  | 'ONLINE_FAILED'
  | 'HELPER_FAILED'
  | 'READINESS_TIMEOUT'
  | 'PORT_OCCUPIED'
  | 'BIND_DENIED'
  | 'NO_LAN_INTERFACE'
  | 'RUNTIME_FAILED';

export type DesktopPlatform = 'win32' | 'darwin' | 'linux';

export interface HostStartOptions {
  port?: number;
  preferredAddress?: string;
  mode?: 'LAN' | 'ONLINE';
  roomCode?: string;
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
  /** Main-process-only acceptance mode; the server binds to this computer's IPv4 loopback address. */
  localAcceptanceMode?: boolean;
  /** Whether this build can make an Online room findable by its code from another network (a registry is configured). */
  discoveryConfigured?: boolean;
  errorCode?: HostRuntimeErrorCode;
  diagnostic?: string;
  onlineDiagnostic?: OnlineDiagnostic;
}

export type HostRuntimeOperationResult =
  | { ok: true; status: HostRuntimeStatus }
  | { ok: false; status: HostRuntimeStatus };

export type HostRuntimeListener = (status: HostRuntimeStatus) => void;

type OnlineLease = Readonly<{ roomCode: string; credential: string; proof: string }>;

interface OnlineActivationOperation {
  epoch: number;
  helper: ServerHelperLike;
  roomCode: string;
  endpoint: string;
  lease: OnlineLease | undefined;
  discovery: RoomDiscoveryProvider | undefined;
  discoveryUnavailable: boolean;
  abort: AbortController;
}

interface HostStartOperation {
  options: HostStartOptions;
  cancelled: boolean;
}

export interface ServerHelperLike {
  readonly state: ServerHelperState;
  readonly diagnostic: string;
  start(): Promise<ServerHelperInfo>;
  stop(): Promise<void>;
  checkHealth?(): Promise<void>;
  /** Tells the server process its public (tunnel) addresses: it signs continuity proofs only for its own addresses. */
  setPublicEndpoints?(endpoints: readonly string[]): void;
  onUnexpectedExit?(listener: (diagnostic: string) => void): () => void;
}

export interface HostRuntimeOptions {
  /** Only the unpackaged shell may connect from the fixed Vite loopback origin. */
  developmentRenderer?: boolean;
  helperPath: string;
  clientDist: string;
  appVersion: string;
  platform?: DesktopPlatform;
  defaultPort?: number;
  /** The usable interfaces, best first; `defaultRouteAddress` is the local address the OS uses for the default route. */
  interfaceProvider?: (defaultRouteAddress?: string) => NetworkInterfaceCandidate[];
  /** Finds the local address of the default route (see `probeDefaultRouteAddress`); without it no route is preferred. */
  routeProbe?: () => Promise<string | undefined>;
  helperFactory?: (port: number, host: string, localAcceptance: boolean) => ServerHelperLike;
  healthCheckIntervalMs?: number;
  connectivity?: ConnectivityProvider;
  discovery?: RoomDiscoveryProvider;
  cloudflaredPath?: string;
  registryUrl?: string;
  /** The desktop shell injects Electron net.fetch to use Chromium's system proxy and certificate handling. */
  onlineFetch?: OnlineFetcher;
  /** Electron's host resolver and cache control for DNS failure diagnostics and recovery. */
  onlineResolver?: OnlineHostResolver;
  /** Enabled only by the main-process command-line acceptance gate. Never accepted through IPC. */
  localAcceptance?: boolean;
  /** Isolated Windows runtime and profile paths for the helper's environment. */
  helperEnvironment?: NodeJS.ProcessEnv;
}

const LOOPBACK_HOST = '127.0.0.1';
const LAN_BIND_HOST = '0.0.0.0';
const AUTO_GAME_PORT = 0;
const AUTO_PORT_ATTEMPTS = 3;
const DIAGNOSTIC_LIMIT = 512;

function platformName(value: NodeJS.Platform = process.platform): DesktopPlatform {
  return value === 'darwin' || value === 'linux' ? value : 'win32';
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeDiagnostic(error: unknown): string {
  return errorText(error)
    .slice(-DIAGNOSTIC_LIMIT);
}

function validatePort(port: number): number {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error('Game port must be between 0 and 65535');
  }
  return port;
}

export function classifyHostRuntimeError(error: unknown): HostRuntimeErrorCode {
  const message = errorText(error).toLowerCase();
  if (message.includes('cloudflared_missing')) return 'CLOUDFLARED_MISSING';
  if (message.includes('cloudflared_corrupt')) return 'CLOUDFLARED_CORRUPT';
  if (message.includes('code_taken')) return 'CODE_TAKEN';
  if (message.includes('registry')) return 'REGISTRY_UNAVAILABLE';
  if (message.includes('tunnel') || message.includes('online')) return 'ONLINE_FAILED';
  if (message.includes('eaddrinuse') || message.includes('address already in use')) {
    return 'PORT_OCCUPIED';
  }
  if (message.includes('eacces') || message.includes('permission denied') || message.includes('bind')) {
    return 'BIND_DENIED';
  }
  if (message.includes('timed out') || message.includes('readiness') || message.includes('became ready')) {
    return 'READINESS_TIMEOUT';
  }
  if (message.includes('helper') || message.includes('server')) return 'HELPER_FAILED';
  return 'RUNTIME_FAILED';
}

function initialStatus(options: HostRuntimeOptions): HostRuntimeStatus {
  return {
    state: 'IDLE',
    platform: options.platform ?? platformName(),
    appVersion: options.appVersion,
    gamePort: null,
    localEndpoint: null,
    lanAvailable: false,
    interfaces: [],
    advertisedEndpoints: [],
    selectedLanUrl: null,
    connectionMode: 'LAN',
    onlineEndpoint: null,
    ...(options.localAcceptance ? { localAcceptanceMode: true } : {}),
  };
}

export class HostRuntimeController {
  private currentStatus: HostRuntimeStatus;
  private helper: ServerHelperLike | undefined;
  private startPromise: Promise<HostRuntimeStatus> | undefined;
  private startOperation: HostStartOperation | undefined;
  private cleanupFailed = false;
  private tunnelOwned = false;
  private stopPromise: Promise<HostRuntimeStatus> | undefined;
  private recoveryPromise: Promise<void> | undefined;
  private healthTimer: NodeJS.Timeout | undefined;
  private removeUnexpectedExitListener: (() => void) | undefined;
  private defaultRouteAddress: string | undefined;
  private readonly listeners = new Set<HostRuntimeListener>();
  private readonly interfaceProvider: (defaultRouteAddress?: string) => NetworkInterfaceCandidate[];
  private connectivity: ConnectivityProvider | undefined;
  private discovery: RoomDiscoveryProvider | undefined;

  /** The registry could not reserve this Online room's code: links work, code lookup across networks does not. */
  private discoveryUnavailable = false;
  private onlineLease: OnlineLease | undefined;
  private onlineRoomCode: string | undefined;
  private renewalTimer: NodeJS.Timeout | undefined;
  private onlineActivationOperation: OnlineActivationOperation | undefined;
  private onlineActivationPromise: Promise<HostRuntimeStatus> | undefined;
  private onlineRecoveryPromise: Promise<void> | undefined;
  private onlineEpoch = 0;
  private onlineAbort: AbortController | undefined;
  private hostRoomCode: string | undefined;
  private hostCreationSecret: string | undefined;

  public constructor(private readonly options: HostRuntimeOptions) {
    for (const [name, value] of [
      ['Host helper path', options.helperPath],
      ['Host client distribution', options.clientDist],
    ] as const) {
      if (!path.isAbsolute(value)) throw new Error(`${name} must be absolute`);
    }
    this.currentStatus = initialStatus(options);
    this.interfaceProvider = options.interfaceProvider
      ?? (defaultRouteAddress => resolveNetworkInterfaces(undefined, defaultRouteAddress));
    this.connectivity = options.connectivity;
    this.discovery = options.discovery;
  }

  public get status(): HostRuntimeStatus {
    return this.snapshot();
  }

  /** Pending startup and incomplete cleanup are busy even before/after visible hosting. */
  public get isBusy(): boolean {
    return Boolean(this.startPromise || this.stopPromise || this.helper || this.tunnelOwned || this.cleanupFailed
      || this.currentStatus.state !== 'IDLE' && this.currentStatus.state !== 'FAILED');
  }

  public get gamePort(): number | null {
    return this.currentStatus.gamePort;
  }

  /** Only the validated desktop IPC sender may request this process-scoped capability. */
  public creationCapability(roomCode: string): string | undefined {
    return this.currentStatus.state === 'HOSTING' && roomCode === this.hostRoomCode
      ? this.hostCreationSecret : undefined;
  }

  public onStatusChanged(listener: HostRuntimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public async start(options: HostStartOptions = {}): Promise<HostRuntimeStatus> {
    if (this.options.localAcceptance && options.mode === 'ONLINE') {
      throw new Error('ONLINE_DISABLED_LOOPBACK_ACCEPTANCE');
    }
    if (this.options.localAcceptance && options.preferredAddress !== undefined) {
      throw new Error('LAN_ADDRESS_DISABLED_LOOPBACK_ACCEPTANCE');
    }
    // Re-evaluate after shutdown: another waiting request may already own the new start.
    if (this.stopPromise) {
      await this.stopPromise;
      return this.start(options);
    }
    if (this.startPromise) {
      const pending = this.startOperation!.options;
      if ((options.mode ?? 'LAN') !== (pending.mode ?? 'LAN')) throw new Error('HOST_MODE_CONFLICT');
      if (options.roomCode !== pending.roomCode) throw new Error('HOST_ROOM_CONFLICT');
      return this.startPromise;
    }
    if (this.currentStatus.state === 'READY' || this.currentStatus.state === 'HOSTING') {
      if (options.mode && options.mode !== this.currentStatus.connectionMode) throw new Error('HOST_MODE_CONFLICT');
      if (options.roomCode && options.roomCode !== this.hostRoomCode) throw new Error('HOST_ROOM_CONFLICT');
      return this.status;
    }
    if (this.helper || this.tunnelOwned || this.cleanupFailed) {
      await this.stop();
      return this.start(options);
    }
    const operation: HostStartOperation = { options: { ...options }, cancelled: false };
    this.startOperation = operation;
    // Install ownership before notifying listeners or invoking any injected async preflight.
    this.startPromise = Promise.resolve().then(() => this.startInternal(operation)).finally(() => {
      if (this.startOperation !== operation) return;
      const wasBusy = this.isBusy;
      this.startOperation = undefined;
      this.startPromise = undefined;
      if (wasBusy !== this.isBusy) this.update({});
    });
    this.update({ state: 'STARTING_SERVER', connectionMode: options.mode ?? 'LAN',
      errorCode: undefined, diagnostic: undefined });
    return this.startPromise;
  }

  public async stop(): Promise<HostRuntimeStatus> {
    if (this.stopPromise) return this.stopPromise;
    if (this.currentStatus.state === 'IDLE' && !this.startPromise && !this.helper && !this.tunnelOwned && !this.cleanupFailed) return this.status;
    if (this.startOperation) this.startOperation.cancelled = true;
    const pendingStart = this.startPromise;
    const pendingRecovery = this.recoveryPromise;
    const pendingOnlineRecovery = this.onlineRecoveryPromise;
    this.stopPromise = Promise.resolve().then(async () => {
      await pendingStart?.catch(() => undefined);
      await pendingRecovery?.catch(() => undefined);
      this.onlineEpoch += 1;
      await pendingOnlineRecovery?.catch(() => undefined);
      return this.stopInternal();
    }).finally(() => {
      const wasBusy = this.isBusy;
      this.stopPromise = undefined;
      if (wasBusy !== this.isBusy) this.update({});
    });
    this.cancelOnlineActivation();
    this.onlineAbort?.abort();
    this.stopHealthMonitor();
    this.update({ state: 'STOPPING', errorCode: undefined, diagnostic: undefined });
    return this.stopPromise;
  }

  private assertStartCurrent(operation: HostStartOperation): void {
    if (operation.cancelled || this.startOperation !== operation) throw new Error('HOST_START_CANCELLED');
  }

  public async activateOnlineRoom(roomCode: string): Promise<HostRuntimeStatus> {
    if (this.options.localAcceptance) throw new Error('ONLINE_DISABLED_LOOPBACK_ACCEPTANCE');
    const endpoint = this.currentStatus.onlineEndpoint;
    const helper = this.helper;
    if (this.onlineRoomCode !== roomCode || !endpoint || !helper || this.stopPromise
      || this.currentStatus.state !== 'HOSTING') throw new Error('ONLINE_ROOM_NOT_READY');
    // Duplicate requests for this owner share one probe, activation and renewal loop.
    const pending = this.onlineActivationOperation;
    if (pending && this.onlineActivationPromise && this.ownsOnlineActivation(pending)) {
      return this.onlineActivationPromise;
    }
    this.cancelOnlineActivation();
    const operation: OnlineActivationOperation = {
      epoch: this.onlineEpoch, helper, roomCode, endpoint, lease: this.onlineLease,
      discovery: this.discovery, discoveryUnavailable: this.discoveryUnavailable, abort: new AbortController(),
    };
    this.onlineActivationOperation = operation;
    this.onlineAbort = operation.abort;
    this.onlineActivationPromise = Promise.resolve().then(() => this.activateOnlineRoomInternal(operation)).finally(() => {
      if (this.onlineActivationOperation === operation) this.onlineActivationPromise = undefined;
      if (this.onlineAbort === operation.abort) this.onlineAbort = undefined;
    });
    return this.onlineActivationPromise;
  }

  private ownsOnlineActivation(operation: OnlineActivationOperation): boolean {
    return this.onlineActivationOperation === operation && !operation.abort.signal.aborted
      && operation.epoch === this.onlineEpoch && operation.helper === this.helper && !this.stopPromise
      && this.currentStatus.state === 'HOSTING' && operation.roomCode === this.onlineRoomCode
      && operation.endpoint === this.currentStatus.onlineEndpoint && operation.lease === this.onlineLease
      && operation.discovery === this.discovery;
  }

  private assertOnlineActivationCurrent(operation: OnlineActivationOperation): void {
    if (!this.ownsOnlineActivation(operation)) throw new Error('ONLINE_ROOM_NOT_READY');
  }

  private cancelOnlineActivation(): void {
    const operation = this.onlineActivationOperation;
    this.onlineActivationOperation = undefined;
    this.onlineActivationPromise = undefined;
    operation?.abort.abort();
    if (operation && this.onlineAbort === operation.abort) this.onlineAbort = undefined;
    if (this.renewalTimer) clearInterval(this.renewalTimer);
    this.renewalTimer = undefined;
  }

  /** Detach cancelled work even when an injected fetch/registry ignores cancellation; observe its late rejection too. */
  private async awaitOnlineActivation<T>(operation: OnlineActivationOperation, work: () => Promise<T>): Promise<T> {
    this.assertOnlineActivationCurrent(operation);
    const signal = operation.abort.signal;
    let cancelled!: () => void;
    const cancellation = new Promise<never>((_resolve, reject) => {
      cancelled = () => reject(new Error('ONLINE_ROOM_NOT_READY'));
      signal.addEventListener('abort', cancelled, { once: true });
    });
    try {
      const result = await Promise.race([cancellation, Promise.resolve().then(() => {
        this.assertOnlineActivationCurrent(operation);
        return work();
      })]);
      this.assertOnlineActivationCurrent(operation);
      return result;
    } finally {
      signal.removeEventListener('abort', cancelled);
    }
  }

  private async activateOnlineRoomInternal(operation: OnlineActivationOperation): Promise<HostRuntimeStatus> {
    const { endpoint, roomCode, abort, lease, discovery } = operation;
    this.assertOnlineActivationCurrent(operation);
    const started = Date.now();
    let roomReady = false;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      this.assertOnlineActivationCurrent(operation);
      this.update({ onlineDiagnostic: { stage: 'PUBLIC_ROOM', outcome: 'STARTED',
        elapsedMs: Date.now() - started, attempts: attempt } });
      let reason: OnlineFailure | undefined;
      let httpStatus: number | undefined;
      const timeout = AbortSignal.timeout(8_000);
      try {
        const response = await this.awaitOnlineActivation(operation, () => (this.options.onlineFetch ?? fetch)(
          `${endpoint}/_otb/room?code=${encodeURIComponent(roomCode)}`, {
            redirect: 'manual', credentials: 'omit', cache: 'no-store',
            signal: AbortSignal.any([abort.signal, timeout]),
          },
        ));
        this.assertOnlineActivationCurrent(operation);
        if (response.ok) {
          await this.awaitOnlineActivation(operation, async () => { await response.body?.cancel().catch(() => undefined); });
          this.assertOnlineActivationCurrent(operation);
          roomReady = true;
          this.update({ onlineDiagnostic: { stage: 'PUBLIC_ROOM', outcome: 'PASSED',
            elapsedMs: Date.now() - started, attempts: attempt } });
          this.assertOnlineActivationCurrent(operation);
          break;
        }
        reason = 'HTTP';
        httpStatus = response.status;
      } catch (error) {
        this.assertOnlineActivationCurrent(operation);
        reason = timeout.aborted ? 'TIMEOUT' : classifyNetworkException(error);
      }
      const retry = attempt < 3 && reason !== 'REDIRECT'
        && !(httpStatus !== undefined && httpStatus >= 300 && httpStatus < 400);
      this.assertOnlineActivationCurrent(operation);
      this.update({ onlineDiagnostic: { stage: 'PUBLIC_ROOM', outcome: retry ? 'RETRYING' : 'FAILED',
        reason, ...(httpStatus === undefined ? {} : { httpStatus }),
        elapsedMs: Date.now() - started, attempts: attempt } });
      this.assertOnlineActivationCurrent(operation);
      if (!retry) break;
      await this.awaitOnlineActivation(operation, () => new Promise<void>(resolve => {
        const cancelled = (): void => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => { abort.signal.removeEventListener('abort', cancelled); resolve(); }, 1_000);
        abort.signal.addEventListener('abort', cancelled, { once: true });
      }));
    }
    this.assertOnlineActivationCurrent(operation);
    if (!roomReady) {
      this.update({ onlineState: 'UNAVAILABLE' });
      throw new Error('ONLINE_ROOM_NOT_READY');
    }
    // The link works even if registry discovery fails. All credentials and callbacks belong to this captured owner.
    let discoveryOk = !operation.discoveryUnavailable;
    if (lease && discovery) {
      try {
        await this.awaitOnlineActivation(operation, () => discovery.activate(lease.roomCode, lease.credential, endpoint));
        discoveryOk = true;
      } catch {
        this.assertOnlineActivationCurrent(operation);
        discoveryOk = false;
      }
    }
    this.assertOnlineActivationCurrent(operation);
    this.update({ onlineState: discoveryOk ? 'READY' : 'DISCOVERY_UNAVAILABLE' });
    this.assertOnlineActivationCurrent(operation);
    if (lease && discovery) {
      let inFlight = false;
      const timer = setInterval(() => {
        if (!this.ownsOnlineActivation(operation) || this.renewalTimer !== timer || inFlight) return;
        inFlight = true;
        void (async () => {
          try {
            await this.awaitOnlineActivation(operation, () => discovery.renew(lease.roomCode, lease.credential));
            if (this.renewalTimer === timer && this.currentStatus.onlineState === 'DISCOVERY_UNAVAILABLE') {
              this.update({ onlineState: 'READY' });
            }
          } catch {
            if (this.ownsOnlineActivation(operation) && this.renewalTimer === timer) {
              this.update({ onlineState: 'DISCOVERY_UNAVAILABLE' });
            }
          } finally {
            inFlight = false;
          }
        })();
      }, 30_000);
      this.renewalTimer = timer;
      timer.unref();
    }
    return this.status;
  }

  public async resolveOnlineRoom(roomCode: string): Promise<string | null> {
    if (this.options.localAcceptance) throw new Error('ONLINE_DISABLED_LOOPBACK_ACCEPTANCE');
    this.discovery ??= this.options.registryUrl
      ? new HttpRoomDiscovery(this.options.registryUrl, this.options.onlineFetch ?? fetch) : undefined;
    if (!this.discovery) throw new Error('REGISTRY_UNAVAILABLE');
    return this.discovery.resolve(roomCode);
  }

  private async stopOnline(strict = false): Promise<void> {
    this.cancelOnlineActivation();
    this.onlineAbort?.abort();
    this.onlineAbort = undefined;
    this.onlineEpoch += 1;
    if (this.renewalTimer) clearInterval(this.renewalTimer);
    this.renewalTimer = undefined;
    const lease = this.onlineLease;
    this.onlineLease = undefined;
    this.onlineRoomCode = undefined;
    if (lease && this.discovery) await this.discovery.revoke(lease.roomCode, lease.credential).catch(() => undefined);
    try {
      if (this.tunnelOwned) {
        if (strict) {
          await this.connectivity?.stop();
          this.tunnelOwned = false;
        } else {
          await this.connectivity?.stop().then(() => { this.tunnelOwned = false; }, () => undefined);
        }
      }
    } finally {
      this.update({ onlineEndpoint: null, onlineState: undefined });
    }
  }

  private async openOnlineTunnel(operation?: HostStartOperation): Promise<string> {
    if (!this.connectivity || !this.currentStatus.localEndpoint) throw new Error('ONLINE_FAILED');
    if (operation) this.assertStartCurrent(operation);
    const helper = this.helper;
    const abort = new AbortController();
    this.onlineAbort = abort;
    this.update({ onlineDiagnostic: undefined });
    const started = Date.now();
    let stage: OnlineStage = 'BINARY_VERIFY';
    let tunnelLost = false;
    let tunnelConnected = false;
    const report = (diagnostic: OnlineDiagnostic): void => {
      if (operation?.cancelled || this.helper !== helper) return;
      this.update({ onlineDiagnostic: { ...diagnostic, tunnelConnected } });
    };
    try {
      if (operation) this.assertStartCurrent(operation);
      this.tunnelOwned = true;
      const publicEndpoint = await this.connectivity.start(this.currentStatus.localEndpoint, () => {
        if (operation?.cancelled || this.helper !== helper) return;
        tunnelLost = true;
        if (this.currentStatus.state !== 'HOSTING' || this.onlineRecoveryPromise) abort.abort();
        else void this.recoverOnlineTunnel();
      }, { signal: abort.signal, onConnectionRegistered: () => {
        if (operation?.cancelled || this.helper !== helper) return;
        tunnelConnected = true;
        if (this.onlineAbort === abort && this.currentStatus.onlineDiagnostic) {
          this.update({ onlineDiagnostic: { ...this.currentStatus.onlineDiagnostic, tunnelConnected: true } });
        }
      }, onStage: next => {
        stage = next;
        report({ stage, outcome: 'STARTED', elapsedMs: Date.now() - started, attempts: 1 });
      } });
      if (operation) this.assertStartCurrent(operation);
      if (abort.signal.aborted) throw new OnlineProbeError('TUNNEL_EXIT');
      stage = 'URL_ANNOUNCEMENT';
      report({ stage, outcome: 'PASSED', elapsedMs: Date.now() - started, attempts: 1 });
      if (operation) this.assertStartCurrent(operation);
      await probePublicTunnel(publicEndpoint, this.options.onlineFetch ?? fetch, abort.signal, report,
        undefined, this.options.onlineResolver);
      if (operation) this.assertStartCurrent(operation);
      return publicEndpoint;
    } catch (error) {
      if (operation?.cancelled) throw error;
      if (tunnelLost) {
        const previous = this.currentStatus.onlineDiagnostic;
        report({ stage: previous?.stage ?? stage, outcome: 'FAILED', reason: 'TUNNEL_EXIT',
          elapsedMs: Date.now() - started, attempts: previous?.attempts ?? 1 });
      } else if (this.currentStatus.onlineDiagnostic?.outcome !== 'FAILED') {
        const reason: OnlineFailure = error instanceof OnlineProbeError ? error.reason
          : abort.signal.aborted ? 'CANCELLED'
            : stage === 'BINARY_VERIFY' ? 'INTEGRITY'
              : errorText(error) === 'TUNNEL_START_TIMEOUT' ? 'TIMEOUT'
                : errorText(error) === 'TUNNEL_EXIT_EARLY' ? 'TUNNEL_EXIT' : 'SPAWN';
        report({ stage, outcome: 'FAILED', reason, elapsedMs: Date.now() - started, attempts: 1 });
      }
      throw error;
    } finally {
      if (this.onlineAbort === abort) this.onlineAbort = undefined;
    }
  }

  private async recoverOnlineTunnel(): Promise<void> {
    if (this.onlineRecoveryPromise) return this.onlineRecoveryPromise;
    const roomCode = this.onlineRoomCode;
    if (!roomCode) return;
    const wasReady = this.currentStatus.onlineState === 'READY';
    const epoch = ++this.onlineEpoch;
    this.cancelOnlineActivation();
    this.update({ onlineState: 'UNAVAILABLE', onlineEndpoint: null });
    if (this.renewalTimer) clearInterval(this.renewalTimer);
    this.renewalTimer = undefined;
    this.onlineRecoveryPromise = (async () => {
      if (this.onlineLease) await this.discovery?.suspend(roomCode, this.onlineLease.credential).catch(() => undefined);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (epoch !== this.onlineEpoch || this.currentStatus.state !== 'HOSTING') return;
        if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 1_000));
        try {
          const endpoint = await this.openOnlineTunnel();
          if (epoch !== this.onlineEpoch) { await this.connectivity?.stop(); return; }
          this.update({ onlineEndpoint: endpoint, onlineState: 'AWAITING_ROOM' });
          if (wasReady) await this.activateOnlineRoom(roomCode).catch(() => undefined);
          return;
        } catch {
          await this.connectivity?.stop().catch(() => undefined);
        }
      }
      this.update({ onlineState: 'UNAVAILABLE', onlineEndpoint: null });
    })().finally(() => { this.onlineRecoveryPromise = undefined; });
    return this.onlineRecoveryPromise;
  }

  public refreshNetwork(preferredAddress?: string): HostRuntimeStatus {
    if (this.options.localAcceptance) {
      if (preferredAddress !== undefined) throw new Error('LAN_ADDRESS_DISABLED_LOOPBACK_ACCEPTANCE');
      return this.status;
    }
    const interfaces = this.interfaceProvider(this.defaultRouteAddress);
    if (preferredAddress && !interfaces.some(candidate => candidate.address === preferredAddress)) {
      throw new Error('Selected LAN address is not available');
    }
    const currentAddress = this.currentStatus.selectedLanUrl
      ? new URL(this.currentStatus.selectedLanUrl).hostname
      : undefined;
    const selectedAddress = preferredAddress
      ?? (interfaces.some(candidate => candidate.address === currentAddress) ? currentAddress : undefined)
      ?? interfaces[0]?.address;
    const port = this.currentStatus.gamePort;
    this.update({
      interfaces,
      lanAvailable: interfaces.length > 0,
      advertisedEndpoints: port ? advertisedEndpoints(interfaces, port) : [],
      selectedLanUrl: selectedAddress && port
        ? `http://${selectedAddress}:${String(port)}`
        : null,
      ...(interfaces.length > 0 || this.currentStatus.connectionMode === 'ONLINE'
        ? { errorCode: this.currentStatus.errorCode === 'NO_LAN_INTERFACE' ? undefined : this.currentStatus.errorCode }
        : { errorCode: 'NO_LAN_INTERFACE' as const }),
    });
    return this.status;
  }

  public async verifyAndRecover(): Promise<HostRuntimeStatus> {
    if (!this.options.localAcceptance) {
      await this.refreshRoute();
      this.refreshNetwork();
    }
    if (this.currentStatus.state !== 'HOSTING' || !this.helper?.checkHealth) return this.status;
    try {
      await this.helper.checkHealth();
    } catch (error) {
      await this.beginRecovery(error);
    }
    return this.status;
  }

  /** The network the device is connected to is the one that carries the default route; a failed probe changes nothing. */
  private async refreshRoute(): Promise<void> {
    if (this.options.localAcceptance || !this.options.routeProbe) return;
    try {
      this.defaultRouteAddress = await this.options.routeProbe();
    } catch {
      this.defaultRouteAddress = undefined;
    }
  }

  private async startInternal(operation: HostStartOperation): Promise<HostRuntimeStatus> {
    const options = operation.options;
    const online = options.mode === 'ONLINE';
    const localAcceptance = this.options.localAcceptance === true;
    let failureCode: HostRuntimeErrorCode | undefined;
    let helperStarted = Date.now();
    try {
      this.assertStartCurrent(operation);
      const requestedPort = validatePort(options.port ?? this.options.defaultPort ?? AUTO_GAME_PORT);
      if (options.roomCode && !/^[A-Z0-9-]{1,20}$/.test(options.roomCode)) throw new Error('INVALID_CODE');
      this.hostRoomCode = options.roomCode;
      this.hostCreationSecret = randomBytes(32).toString('hex');
      if (online) {
        if (!options.roomCode) throw new Error('INVALID_CODE');
        this.onlineRoomCode = options.roomCode;
        this.discovery ??= this.options.registryUrl
          ? new HttpRoomDiscovery(this.options.registryUrl, this.options.onlineFetch ?? fetch) : undefined;
        this.connectivity ??= new CloudflareQuickTunnel(this.options.cloudflaredPath);
        this.discoveryUnavailable = false;
        if (this.discovery) {
          // A late reservation still belongs to this start: Stop must revoke it before completing.
          try {
            const reservation = await this.discovery.reserve(options.roomCode);
            this.onlineLease = { roomCode: options.roomCode, ...reservation };
          } catch (error) {
            this.assertStartCurrent(operation);
            if (errorText(error) === 'CODE_TAKEN') throw error;
            this.discoveryUnavailable = true;
          }
          this.assertStartCurrent(operation);
        }
        this.update({ discoveryConfigured: Boolean(this.discovery) });
      }
      this.assertStartCurrent(operation);
      if (!localAcceptance) await this.refreshRoute();
      this.assertStartCurrent(operation);
      const interfaces = localAcceptance ? [] : this.interfaceProvider(this.defaultRouteAddress);
      const preferredAddress = localAcceptance ? undefined : options.preferredAddress ?? interfaces[0]?.address;
      if (!localAcceptance && !online && (!preferredAddress || !interfaces.some(candidate => candidate.address === preferredAddress))) {
        failureCode = 'NO_LAN_INTERFACE';
        this.update({ interfaces, lanAvailable: false });
        throw new Error('No usable LAN IPv4 interface is available');
      }

      this.assertStartCurrent(operation);
      this.update({
        state: 'STARTING_SERVER',
        connectionMode: online ? 'ONLINE' : 'LAN',
        onlineState: online ? 'CONNECTING' : undefined,
        onlineEndpoint: null,
        gamePort: requestedPort || null,
        localEndpoint: requestedPort ? `http://${LOOPBACK_HOST}:${String(requestedPort)}` : null,
        interfaces,
        lanAvailable: interfaces.length > 0,
        advertisedEndpoints: !localAcceptance && requestedPort ? advertisedEndpoints(interfaces, requestedPort) : [],
        selectedLanUrl: !localAcceptance && preferredAddress && requestedPort
          ? `http://${preferredAddress}:${String(requestedPort)}` : null,
        errorCode: undefined,
        diagnostic: undefined,
        onlineDiagnostic: online ? { stage: 'HELPER_READY', outcome: 'STARTED', elapsedMs: 0, attempts: 1 } : undefined,
      });
      this.assertStartCurrent(operation);
      helperStarted = Date.now();
      const helperInfo = await this.startHelperWithRetry(requestedPort, operation);
      this.assertStartCurrent(operation);
      const port = helperInfo.port;
      this.update({
        state: online ? 'STARTING_SERVER' : 'HOSTING',
        gamePort: port,
        localEndpoint: `http://${LOOPBACK_HOST}:${String(port)}`,
        interfaces,
        advertisedEndpoints: localAcceptance ? [] : advertisedEndpoints(interfaces, port),
        selectedLanUrl: !localAcceptance && preferredAddress ? `http://${preferredAddress}:${String(port)}` : null,
        lanAvailable: interfaces.length > 0,
        errorCode: undefined,
        diagnostic: undefined,
        onlineDiagnostic: online ? { stage: 'HELPER_READY', outcome: 'PASSED',
          elapsedMs: Date.now() - helperStarted, attempts: 1 } : undefined,
      });
      this.assertStartCurrent(operation);
      this.startHealthMonitor();
      if (online && this.connectivity) {
        const publicEndpoint = await this.openOnlineTunnel(operation);
        this.assertStartCurrent(operation);
        this.update({ state: 'HOSTING', onlineEndpoint: publicEndpoint, onlineState: 'AWAITING_ROOM' });
      }
      this.assertStartCurrent(operation);
      return this.status;
    } catch (error) {
      // Stop owns cancelled-start cleanup after the acquisition promise has settled.
      if (operation.cancelled) throw new Error('HOST_START_CANCELLED', { cause: error });
      if (online && this.currentStatus.onlineDiagnostic?.stage === 'HELPER_READY'
        && this.currentStatus.onlineDiagnostic.outcome === 'STARTED') {
        this.update({ onlineDiagnostic: { stage: 'HELPER_READY', outcome: 'FAILED', reason: 'HELPER',
          elapsedMs: Date.now() - helperStarted, attempts: 1 } });
      }
      await this.stopOwnedResources().catch(() => undefined);
      if (operation.cancelled) throw new Error('HOST_START_CANCELLED', { cause: error });
      this.update({
        state: 'FAILED',
        errorCode: failureCode ?? classifyHostRuntimeError(error),
        diagnostic: online ? this.currentStatus.onlineDiagnostic
          ? `${this.currentStatus.onlineDiagnostic.stage}:${this.currentStatus.onlineDiagnostic.reason ?? 'UNKNOWN'}`
          : 'ONLINE_FAILED' : safeDiagnostic(error),
      });
      throw error;
    }
  }

  private createHelper(port: number): ServerHelperLike {
    const localAcceptance = this.options.localAcceptance === true;
    const host = localAcceptance ? LOOPBACK_HOST : LAN_BIND_HOST;
    const hostEnvironment = this.onlineLease ? {
      OTB_REGISTRY_ROOM_CODE: this.onlineLease.roomCode,
      OTB_REGISTRY_PROOF: this.onlineLease.proof,
      OTB_ONLINE_ROOM_CODE: this.onlineLease.roomCode,
      OTB_HOST_ROOM_CODE: this.hostRoomCode,
      OTB_HOST_CREATE_SECRET: this.hostCreationSecret,
    } : {
      ...(this.onlineRoomCode ? { OTB_ONLINE_ROOM_CODE: this.onlineRoomCode } : {}),
      ...(this.hostRoomCode ? { OTB_HOST_ROOM_CODE: this.hostRoomCode } : {}),
      OTB_HOST_CREATE_SECRET: this.hostCreationSecret,
    };
    return this.options.helperFactory?.(port, host, localAcceptance)
      ?? new ServerHelperController({
        modulePath: this.options.helperPath,
        clientDist: this.options.clientDist,
        host,
        port,
        environment: { ...(localAcceptance ? this.options.helperEnvironment : {}), ...hostEnvironment,
          OTB_DEVELOPMENT_RENDERER: this.options.developmentRenderer ? '1' : '' },
        ...(localAcceptance ? { loopbackOnly: true, inheritEnvironment: false } : {}),
      });
  }

  private async startHelperWithRetry(requestedPort: number, operation: HostStartOperation): Promise<ServerHelperInfo> {
    const attempts = requestedPort === AUTO_GAME_PORT ? AUTO_PORT_ATTEMPTS : 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      this.assertStartCurrent(operation);
      const helper = this.createHelper(requestedPort);
      this.helper = helper;
      this.assertStartCurrent(operation);
      try {
        const info = await helper.start();
        this.assertStartCurrent(operation);
        const expectedHost = this.options.localAcceptance ? LOOPBACK_HOST : LAN_BIND_HOST;
        if (info.host !== expectedHost
          || requestedPort !== AUTO_GAME_PORT && info.port !== requestedPort) {
          throw new Error('Server helper announced an unexpected bind address');
        }
        this.attachHelperListener(helper);
        return info;
      } catch (error) {
        this.assertStartCurrent(operation);
        lastError = error;
        await this.stopHelper();
        this.assertStartCurrent(operation);
        if (requestedPort !== AUTO_GAME_PORT || classifyHostRuntimeError(error) !== 'PORT_OCCUPIED') break;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(errorText(lastError));
  }

  private async stopHelper(): Promise<void> {
    const helper = this.helper;
    this.detachHelperListener();
    await helper?.stop();
    // Retain ownership on failure so another Stop can retry instead of forgetting a live resource.
    if (this.helper === helper) this.helper = undefined;
  }

  private async stopOwnedResources(): Promise<void> {
    this.stopHealthMonitor();
    let failed = false;
    let firstError: unknown;
    try { await this.stopOnline(true); } catch (error) { failed = true; firstError = error; }
    try { await this.stopHelper(); } catch (error) {
      if (!failed) firstError = error;
      failed = true;
    }
    this.hostCreationSecret = undefined;
    this.hostRoomCode = undefined;
    this.cleanupFailed = failed;
    if (failed) throw firstError;
  }

  private attachHelperListener(helper: ServerHelperLike): void {
    this.detachHelperListener();
    this.removeUnexpectedExitListener = helper.onUnexpectedExit?.(diagnostic => {
      if (this.helper !== helper || this.currentStatus.state !== 'HOSTING') return;
      void this.beginRecovery(new Error(diagnostic || 'Server helper exited unexpectedly'));
    });
  }

  private detachHelperListener(): void {
    this.removeUnexpectedExitListener?.();
    this.removeUnexpectedExitListener = undefined;
  }

  private startHealthMonitor(): void {
    this.stopHealthMonitor();
    const intervalMs = this.options.healthCheckIntervalMs ?? 5_000;
    if (intervalMs <= 0 || !this.helper?.checkHealth) return;
    this.healthTimer = setInterval(() => {
      void this.verifyAndRecover().catch(() => undefined);
    }, intervalMs);
    this.healthTimer.unref();
  }

  private stopHealthMonitor(): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = undefined;
  }

  private beginRecovery(error: unknown): Promise<void> {
    if (this.recoveryPromise) return this.recoveryPromise;
    if (this.currentStatus.state === 'IDLE' || this.currentStatus.state === 'STOPPING') {
      return Promise.resolve();
    }
    this.recoveryPromise = this.recover(error).finally(() => {
      this.recoveryPromise = undefined;
    });
    return this.recoveryPromise;
  }

  private async recover(error: unknown): Promise<void> {
    this.stopHealthMonitor();
    // A helper exit destroys the only authoritative copy of the match.
    // Never restart it behind an existing room or reconnect token.
    await this.stopOnline();
    this.detachHelperListener();
    await this.helper?.stop().catch(() => undefined);
    this.helper = undefined;
    this.hostCreationSecret = undefined;
    this.hostRoomCode = undefined;
    this.failRecovery(error);
  }

  private failRecovery(error: unknown): void {
    this.stopHealthMonitor();
    this.update({
      state: 'FAILED',
      errorCode: classifyHostRuntimeError(error),
      diagnostic: safeDiagnostic(error),
    });
  }

  private async stopInternal(): Promise<HostRuntimeStatus> {
    try {
      await this.stopOwnedResources();
    } catch (error) {
      this.update({ state: 'FAILED', errorCode: classifyHostRuntimeError(error), diagnostic: safeDiagnostic(error) });
      throw error instanceof Error ? error : new Error(errorText(error));
    }
    this.update({
      state: 'IDLE',
      gamePort: null,
      localEndpoint: null,
      lanAvailable: false,
      interfaces: [],
      advertisedEndpoints: [],
      selectedLanUrl: null,
      connectionMode: 'LAN',
      onlineDiagnostic: undefined,
    });
    return this.status;
  }

  private update(update: Partial<HostRuntimeStatus>): void {
    const previousOnline = this.currentStatus.onlineEndpoint;
    this.currentStatus = { ...this.currentStatus, ...update };
    const online = this.currentStatus.onlineEndpoint;
    if ('onlineEndpoint' in update && online !== previousOnline) this.helper?.setPublicEndpoints?.(online ? [online] : []);
    const status = this.status;
    for (const listener of this.listeners) listener(status);
  }

  private snapshot(): HostRuntimeStatus {
    return {
      ...this.currentStatus,
      interfaces: this.currentStatus.interfaces.map(candidate => ({ ...candidate })),
      advertisedEndpoints: [...this.currentStatus.advertisedEndpoints],
    };
  }
}
