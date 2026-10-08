import path from 'node:path';
import { CloudflareQuickTunnel, type ConnectivityProvider } from './online/connectivity';
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
  errorCode?: HostRuntimeErrorCode;
  diagnostic?: string;
}

export type HostRuntimeOperationResult =
  | { ok: true; status: HostRuntimeStatus }
  | { ok: false; status: HostRuntimeStatus };

export type HostRuntimeListener = (status: HostRuntimeStatus) => void;

export interface ServerHelperLike {
  readonly state: ServerHelperState;
  readonly diagnostic: string;
  start(): Promise<ServerHelperInfo>;
  stop(): Promise<void>;
  checkHealth?(): Promise<void>;
  onUnexpectedExit?(listener: (diagnostic: string) => void): () => void;
}

export interface HostRuntimeOptions {
  helperPath: string;
  clientDist: string;
  appVersion: string;
  platform?: DesktopPlatform;
  defaultPort?: number;
  /** The usable interfaces, best first; `defaultRouteAddress` is the local address the OS uses for the default route. */
  interfaceProvider?: (defaultRouteAddress?: string) => NetworkInterfaceCandidate[];
  /** Finds the local address of the default route (see `probeDefaultRouteAddress`); without it no route is preferred. */
  routeProbe?: () => Promise<string | undefined>;
  helperFactory?: (port: number) => ServerHelperLike;
  healthCheckIntervalMs?: number;
  connectivity?: ConnectivityProvider;
  discovery?: RoomDiscoveryProvider;
  cloudflaredPath?: string;
  registryUrl?: string;
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
  };
}

export class HostRuntimeController {
  private currentStatus: HostRuntimeStatus;
  private helper: ServerHelperLike | undefined;
  private startPromise: Promise<HostRuntimeStatus> | undefined;
  private stopPromise: Promise<HostRuntimeStatus> | undefined;
  private recoveryPromise: Promise<void> | undefined;
  private healthTimer: NodeJS.Timeout | undefined;
  private removeUnexpectedExitListener: (() => void) | undefined;
  private defaultRouteAddress: string | undefined;
  private readonly listeners = new Set<HostRuntimeListener>();
  private readonly interfaceProvider: (defaultRouteAddress?: string) => NetworkInterfaceCandidate[];
  private connectivity: ConnectivityProvider | undefined;
  private discovery: RoomDiscoveryProvider | undefined;
  private onlineLease: { roomCode: string; credential: string; proof: string } | undefined;
  private onlineRoomCode: string | undefined;
  private renewalTimer: NodeJS.Timeout | undefined;
  private onlineRecoveryPromise: Promise<void> | undefined;
  private onlineEpoch = 0;

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

  public get gamePort(): number | null {
    return this.currentStatus.gamePort;
  }

  public onStatusChanged(listener: HostRuntimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public async start(options: HostStartOptions = {}): Promise<HostRuntimeStatus> {
    if (this.currentStatus.state === 'READY' || this.currentStatus.state === 'HOSTING') {
      if (options.mode && options.mode !== this.currentStatus.connectionMode) throw new Error('HOST_MODE_CONFLICT');
      return this.status;
    }
    if (this.startPromise) return this.startPromise;
    if (this.stopPromise) await this.stopPromise;
    this.startPromise = this.startInternal(options).catch(error => {
      if (this.currentStatus.state !== 'FAILED') {
        this.update({ state: 'FAILED', errorCode: classifyHostRuntimeError(error) });
      }
      throw error;
    }).finally(() => {
      this.startPromise = undefined;
    });
    return this.startPromise;
  }

  public async stop(): Promise<HostRuntimeStatus> {
    if (this.currentStatus.state === 'IDLE') return this.status;
    if (this.stopPromise) return this.stopPromise;
    const pendingStart = this.startPromise;
    const pendingRecovery = this.recoveryPromise;
    const pendingOnlineRecovery = this.onlineRecoveryPromise;
    this.stopPromise = (async () => {
      await pendingStart?.catch(() => undefined);
      await pendingRecovery?.catch(() => undefined);
      this.onlineEpoch += 1;
      await pendingOnlineRecovery?.catch(() => undefined);
      return this.stopInternal();
    })().finally(() => {
      this.stopPromise = undefined;
    });
    return this.stopPromise;
  }

  public async activateOnlineRoom(roomCode: string): Promise<HostRuntimeStatus> {
    const endpoint = this.currentStatus.onlineEndpoint;
    if (this.onlineRoomCode !== roomCode || !endpoint
      || this.currentStatus.state !== 'HOSTING') throw new Error('ONLINE_ROOM_NOT_READY');
    try {
      const response = await fetch(`${endpoint}/_otb/room?code=${encodeURIComponent(roomCode)}`, {
        redirect: 'error', signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error('ONLINE_ROOM_NOT_READY');
      if (this.onlineLease && this.discovery) {
        await this.discovery.activate(roomCode, this.onlineLease.credential, endpoint);
      }
    } catch (error) {
      this.update({ onlineState: 'UNAVAILABLE' });
      throw error;
    }
    this.update({ onlineState: 'READY' });
    if (this.renewalTimer) clearInterval(this.renewalTimer);
    if (this.onlineLease && this.discovery) {
      const lease = this.onlineLease;
      this.renewalTimer = setInterval(() => {
        void this.discovery?.renew(roomCode, lease.credential).catch(() => {
          this.update({ onlineState: 'DISCOVERY_UNAVAILABLE' });
        });
      }, 30_000);
      this.renewalTimer.unref();
    }
    return this.status;
  }

  public async resolveOnlineRoom(roomCode: string): Promise<string | null> {
    this.discovery ??= this.options.registryUrl ? new HttpRoomDiscovery(this.options.registryUrl) : undefined;
    if (!this.discovery) throw new Error('REGISTRY_UNAVAILABLE');
    return this.discovery.resolve(roomCode);
  }

  private async stopOnline(): Promise<void> {
    this.onlineEpoch += 1;
    if (this.renewalTimer) clearInterval(this.renewalTimer);
    this.renewalTimer = undefined;
    const lease = this.onlineLease;
    this.onlineLease = undefined;
    this.onlineRoomCode = undefined;
    if (lease && this.discovery) await this.discovery.revoke(lease.roomCode, lease.credential).catch(() => undefined);
    await this.connectivity?.stop().catch(() => undefined);
    this.update({ onlineEndpoint: null, onlineState: undefined });
  }

  private async openOnlineTunnel(): Promise<string> {
    if (!this.connectivity || !this.currentStatus.localEndpoint) throw new Error('ONLINE_FAILED');
    const publicEndpoint = await this.connectivity.start(this.currentStatus.localEndpoint, () => {
      if (this.currentStatus.state === 'HOSTING') void this.recoverOnlineTunnel();
    });
    const deadline = Date.now() + 40_000;
    do {
      try {
        const response = await fetch(`${publicEndpoint}/readyz`, {
          redirect: 'error', signal: AbortSignal.timeout(5_000),
        });
        const page = await fetch(`${publicEndpoint}/`, {
          redirect: 'error', signal: AbortSignal.timeout(5_000),
        });
        if (response.ok && page.ok && (await page.text()).includes('<html')) return publicEndpoint;
      } catch { /* DNS and the public route can lag the tunnel URL announcement. */ }
      await new Promise(resolve => setTimeout(resolve, 1_000));
    } while (Date.now() < deadline);
    throw new Error('ONLINE_FAILED');
  }

  private async recoverOnlineTunnel(): Promise<void> {
    if (this.onlineRecoveryPromise) return this.onlineRecoveryPromise;
    const roomCode = this.onlineRoomCode;
    if (!roomCode) return;
    const wasReady = this.currentStatus.onlineState === 'READY';
    const epoch = ++this.onlineEpoch;
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
    await this.refreshRoute();
    this.refreshNetwork();
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
    if (!this.options.routeProbe) return;
    try {
      this.defaultRouteAddress = await this.options.routeProbe();
    } catch {
      this.defaultRouteAddress = undefined;
    }
  }

  private async startInternal(options: HostStartOptions): Promise<HostRuntimeStatus> {
    const requestedPort = validatePort(options.port ?? this.options.defaultPort ?? AUTO_GAME_PORT);
    const online = options.mode === 'ONLINE';
    if (online) {
      if (!options.roomCode || !/^[A-Z0-9-]{1,20}$/.test(options.roomCode)) throw new Error('INVALID_CODE');
      this.onlineRoomCode = options.roomCode;
      this.discovery ??= this.options.registryUrl ? new HttpRoomDiscovery(this.options.registryUrl) : undefined;
      this.connectivity ??= new CloudflareQuickTunnel(this.options.cloudflaredPath);
      if (this.discovery) {
        // Registry discovery is optional; a complete HTTPS invitation carries
        // its endpoint and code even when the registry is unavailable.
        const reservation = await this.discovery.reserve(options.roomCode).catch(() => undefined);
        if (reservation) this.onlineLease = { roomCode: options.roomCode, ...reservation };
      }
    }
    await this.refreshRoute();
    const interfaces = this.interfaceProvider(this.defaultRouteAddress);
    const preferredAddress = options.preferredAddress ?? interfaces[0]?.address;
    if (!online && (!preferredAddress || !interfaces.some(candidate => candidate.address === preferredAddress))) {
      const error = new Error('No usable LAN IPv4 interface is available');
      this.update({
        state: 'FAILED',
        interfaces,
        lanAvailable: false,
        errorCode: 'NO_LAN_INTERFACE',
        diagnostic: safeDiagnostic(error),
      });
      throw error;
    }

    this.update({
      state: 'STARTING_SERVER',
      connectionMode: online ? 'ONLINE' : 'LAN',
      onlineState: online ? 'CONNECTING' : undefined,
      onlineEndpoint: null,
      gamePort: requestedPort || null,
      localEndpoint: requestedPort ? `http://${LOOPBACK_HOST}:${String(requestedPort)}` : null,
      interfaces,
      lanAvailable: interfaces.length > 0,
      advertisedEndpoints: requestedPort ? advertisedEndpoints(interfaces, requestedPort) : [],
      selectedLanUrl: preferredAddress && requestedPort ? `http://${preferredAddress}:${String(requestedPort)}` : null,
      errorCode: undefined,
      diagnostic: undefined,
    });
    try {
      const helperInfo = await this.startHelperWithRetry(requestedPort);
      const port = helperInfo.port;
      this.update({
        state: online ? 'STARTING_SERVER' : 'HOSTING',
        gamePort: port,
        localEndpoint: `http://${LOOPBACK_HOST}:${String(port)}`,
        interfaces,
        advertisedEndpoints: advertisedEndpoints(interfaces, port),
        selectedLanUrl: preferredAddress ? `http://${preferredAddress}:${String(port)}` : null,
        lanAvailable: interfaces.length > 0,
        errorCode: undefined,
        diagnostic: undefined,
      });
      this.startHealthMonitor();
      if (online && this.connectivity) {
        const publicEndpoint = await this.openOnlineTunnel();
        this.update({ state: 'HOSTING', onlineEndpoint: publicEndpoint, onlineState: 'AWAITING_ROOM' });
      }
      return this.status;
    } catch (error) {
      await this.stopOnline();
      this.detachHelperListener();
      await this.helper?.stop().catch(() => undefined);
      this.helper = undefined;
      this.update({
        state: 'FAILED',
        errorCode: classifyHostRuntimeError(error),
        diagnostic: safeDiagnostic(error),
      });
      throw error;
    }
  }

  private createHelper(port: number): ServerHelperLike {
    return this.options.helperFactory?.(port)
      ?? new ServerHelperController({
        modulePath: this.options.helperPath,
        clientDist: this.options.clientDist,
        host: LAN_BIND_HOST,
        port,
        environment: this.onlineLease ? {
          OTB_REGISTRY_ROOM_CODE: this.onlineLease.roomCode,
          OTB_REGISTRY_PROOF: this.onlineLease.proof,
          OTB_ONLINE_ROOM_CODE: this.onlineLease.roomCode,
        } : this.onlineRoomCode ? { OTB_ONLINE_ROOM_CODE: this.onlineRoomCode } : undefined,
      });
  }

  private async startHelperWithRetry(requestedPort: number): Promise<ServerHelperInfo> {
    const attempts = requestedPort === AUTO_GAME_PORT ? AUTO_PORT_ATTEMPTS : 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const helper = this.createHelper(requestedPort);
      this.helper = helper;
      try {
        const info = await helper.start();
        if (info.host !== LAN_BIND_HOST
          || requestedPort !== AUTO_GAME_PORT && info.port !== requestedPort) {
          throw new Error('Server helper announced an unexpected LAN endpoint');
        }
        this.attachHelperListener(helper);
        return info;
      } catch (error) {
        lastError = error;
        await helper.stop().catch(() => undefined);
        if (requestedPort !== AUTO_GAME_PORT || classifyHostRuntimeError(error) !== 'PORT_OCCUPIED') break;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(errorText(lastError));
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
    await this.stopOnline();
    this.stopHealthMonitor();
    this.update({ state: 'STOPPING', errorCode: undefined, diagnostic: undefined });
    let firstError: unknown;
    this.detachHelperListener();
    try {
      await this.helper?.stop();
    } catch (error) {
      firstError = error;
    }
    this.helper = undefined;
    if (firstError) {
      this.update({
        state: 'FAILED',
        errorCode: classifyHostRuntimeError(firstError),
        diagnostic: safeDiagnostic(firstError),
      });
      throw firstError instanceof Error ? firstError : new Error(errorText(firstError));
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
    });
    return this.status;
  }

  private update(update: Partial<HostRuntimeStatus>): void {
    this.currentStatus = { ...this.currentStatus, ...update };
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
