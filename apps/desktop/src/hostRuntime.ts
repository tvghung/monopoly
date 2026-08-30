import path from 'node:path';

import {
  ManagedPostgresController,
  type ManagedPostgresInfo,
  type ManagedPostgresState,
} from './managedPostgres';
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

export type DesktopPlatform = 'win32' | 'darwin' | 'linux';

export interface HostStartOptions {
  port?: number;
  preferredAddress?: string;
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

export type HostRuntimeListener = (status: HostRuntimeStatus) => void;

export interface ManagedPostgresLike {
  readonly state: ManagedPostgresState;
  start(): Promise<ManagedPostgresInfo>;
  stop(): Promise<void>;
}

export interface ServerHelperLike {
  readonly state: ServerHelperState;
  readonly diagnostic: string;
  start(): Promise<ServerHelperInfo>;
  stop(): Promise<void>;
  checkHealth?(): Promise<void>;
  onUnexpectedExit?(listener: (diagnostic: string) => void): () => void;
}

export interface HostRuntimeOptions {
  resourceRoot: string;
  helperPath: string;
  migrationDirectory: string;
  clientDist: string;
  userDataPath: string;
  appVersion: string;
  platform?: DesktopPlatform;
  defaultPort?: number;
  interfaceProvider?: () => NetworkInterfaceCandidate[];
  postgres?: ManagedPostgresLike;
  helperFactory?: (databaseUrl: string, port: number) => ServerHelperLike;
  healthCheckIntervalMs?: number;
}

const LOOPBACK_HOST = '127.0.0.1';
const LAN_BIND_HOST = '0.0.0.0';
const AUTO_GAME_PORT = 0;
const AUTO_PORT_ATTEMPTS = 3;
const RECOVERY_ATTEMPTS = 2;
const RECOVERY_BACKOFF_MS = 250;
const DIAGNOSTIC_LIMIT = 512;

function platformName(value: NodeJS.Platform = process.platform): DesktopPlatform {
  return value === 'darwin' || value === 'linux' ? value : 'win32';
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeDiagnostic(error: unknown): string {
  return errorText(error)
    .replace(/postgres(?:ql)?(?:\+[^:]+)?:\/\/[^\s"'\x60]+/giu, 'postgresql://[redacted]')
    .replace(/(DATABASE_URL|PGPASSWORD)\s*[=:]\s*[^\s]+/giu, '$1=[redacted]')
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
  if (message.includes('eaddrinuse') || message.includes('address already in use')) {
    return 'PORT_OCCUPIED';
  }
  if (message.includes('eacces') || message.includes('permission denied') || message.includes('bind')) {
    return 'BIND_DENIED';
  }
  if (message.includes('migration')) return 'MIGRATION_FAILED';
  if (message.includes('timed out') || message.includes('readiness') || message.includes('became ready')) {
    return 'READINESS_TIMEOUT';
  }
  if (message.includes('helper') || message.includes('server')) return 'HELPER_FAILED';
  if (message.includes('resource') || message.includes('enoent') || message.includes('initdb')) {
    return 'POSTGRES_RESOURCES_MISSING';
  }
  if (message.includes('postgres') || message.includes('pg_ctl') || message.includes('database')) {
    return 'POSTGRES_INITIALIZATION_FAILED';
  }
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
  };
}

export class HostRuntimeController {
  private currentStatus: HostRuntimeStatus;
  private postgres: ManagedPostgresLike | undefined;
  private helper: ServerHelperLike | undefined;
  private databaseUrl: string | undefined;
  private startPromise: Promise<HostRuntimeStatus> | undefined;
  private stopPromise: Promise<HostRuntimeStatus> | undefined;
  private recoveryPromise: Promise<void> | undefined;
  private recoveryAttemptsUsed = 0;
  private healthTimer: NodeJS.Timeout | undefined;
  private removeUnexpectedExitListener: (() => void) | undefined;
  private readonly listeners = new Set<HostRuntimeListener>();
  private readonly interfaceProvider: () => NetworkInterfaceCandidate[];

  public constructor(private readonly options: HostRuntimeOptions) {
    for (const [name, value] of [
      ['Host PostgreSQL resource root', options.resourceRoot],
      ['Host helper path', options.helperPath],
      ['Host migration directory', options.migrationDirectory],
      ['Host client distribution', options.clientDist],
      ['Host user data path', options.userDataPath],
    ] as const) {
      if (!path.isAbsolute(value)) throw new Error(`${name} must be absolute`);
    }
    this.currentStatus = initialStatus(options);
    this.postgres = options.postgres;
    this.interfaceProvider = options.interfaceProvider ?? (() => resolveNetworkInterfaces());
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
      return this.status;
    }
    if (this.startPromise) return this.startPromise;
    if (this.stopPromise) await this.stopPromise;
    this.recoveryAttemptsUsed = 0;
    this.startPromise = this.startInternal(options).finally(() => {
      this.startPromise = undefined;
    });
    return this.startPromise;
  }

  public async stop(): Promise<HostRuntimeStatus> {
    if (this.currentStatus.state === 'IDLE') return this.status;
    if (this.stopPromise) return this.stopPromise;
    const pendingStart = this.startPromise;
    const pendingRecovery = this.recoveryPromise;
    this.stopPromise = (async () => {
      await pendingStart?.catch(() => undefined);
      await pendingRecovery?.catch(() => undefined);
      return this.stopInternal();
    })().finally(() => {
      this.stopPromise = undefined;
    });
    return this.stopPromise;
  }

  public refreshNetwork(preferredAddress?: string): HostRuntimeStatus {
    const interfaces = this.interfaceProvider();
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
      ...(interfaces.length > 0
        ? { errorCode: this.currentStatus.errorCode === 'NO_LAN_INTERFACE' ? undefined : this.currentStatus.errorCode }
        : { errorCode: 'NO_LAN_INTERFACE' as const }),
    });
    return this.status;
  }

  public async verifyAndRecover(): Promise<HostRuntimeStatus> {
    this.refreshNetwork();
    if (this.currentStatus.state !== 'HOSTING' || !this.helper?.checkHealth) return this.status;
    try {
      await this.helper.checkHealth();
    } catch (error) {
      await this.beginRecovery('database', error);
    }
    return this.status;
  }

  private async startInternal(options: HostStartOptions): Promise<HostRuntimeStatus> {
    const requestedPort = validatePort(options.port ?? this.options.defaultPort ?? AUTO_GAME_PORT);
    const interfaces = this.interfaceProvider();
    const preferredAddress = options.preferredAddress ?? interfaces[0]?.address;
    if (!preferredAddress || !interfaces.some(candidate => candidate.address === preferredAddress)) {
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
      state: 'STARTING_POSTGRES',
      gamePort: requestedPort || null,
      localEndpoint: requestedPort ? `http://${LOOPBACK_HOST}:${String(requestedPort)}` : null,
      interfaces,
      lanAvailable: true,
      advertisedEndpoints: requestedPort ? advertisedEndpoints(interfaces, requestedPort) : [],
      selectedLanUrl: requestedPort ? `http://${preferredAddress}:${String(requestedPort)}` : null,
      errorCode: undefined,
      diagnostic: undefined,
    });
    let postgresStarted = false;
    try {
      this.postgres ??= new ManagedPostgresController({
        resourceRoot: this.options.resourceRoot,
        userDataPath: this.options.userDataPath,
      });
      const postgresInfo = await this.postgres.start();
      this.databaseUrl = postgresInfo.databaseUrl;
      postgresStarted = true;
      this.update({ state: 'STARTING_SERVER' });
      const helperInfo = await this.startHelperWithRetry(postgresInfo.databaseUrl, requestedPort);
      const port = helperInfo.port;
      this.update({
        state: 'HOSTING',
        gamePort: port,
        localEndpoint: `http://${LOOPBACK_HOST}:${String(port)}`,
        interfaces,
        advertisedEndpoints: advertisedEndpoints(interfaces, port),
        selectedLanUrl: `http://${preferredAddress}:${String(port)}`,
        lanAvailable: true,
        errorCode: undefined,
        diagnostic: undefined,
      });
      this.startHealthMonitor();
      return this.status;
    } catch (error) {
      this.detachHelperListener();
      await this.helper?.stop().catch(() => undefined);
      this.helper = undefined;
      if (postgresStarted) await this.postgres?.stop().catch(() => undefined);
      this.databaseUrl = undefined;
      this.update({
        state: 'FAILED',
        errorCode: classifyHostRuntimeError(error),
        diagnostic: safeDiagnostic(error),
      });
      throw error;
    }
  }

  private createHelper(databaseUrl: string, port: number): ServerHelperLike {
    return this.options.helperFactory?.(databaseUrl, port)
      ?? new ServerHelperController({
        modulePath: this.options.helperPath,
        migrationDirectory: this.options.migrationDirectory,
        clientDist: this.options.clientDist,
        databaseUrl,
        host: LAN_BIND_HOST,
        port,
      });
  }

  private async startHelperWithRetry(databaseUrl: string, requestedPort: number): Promise<ServerHelperInfo> {
    const attempts = requestedPort === AUTO_GAME_PORT ? AUTO_PORT_ATTEMPTS : 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const helper = this.createHelper(databaseUrl, requestedPort);
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
      void this.beginRecovery('helper', new Error(diagnostic || 'Server helper exited unexpectedly'));
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

  private beginRecovery(kind: 'helper' | 'database', error: unknown): Promise<void> {
    if (this.recoveryPromise) return this.recoveryPromise;
    if (this.currentStatus.state === 'IDLE' || this.currentStatus.state === 'STOPPING') {
      return Promise.resolve();
    }
    this.recoveryPromise = this.recover(kind, error).finally(() => {
      this.recoveryPromise = undefined;
    });
    return this.recoveryPromise;
  }

  private async recover(kind: 'helper' | 'database', initialError: unknown): Promise<void> {
    this.stopHealthMonitor();
    const port = this.currentStatus.gamePort;
    if (!port || !this.postgres || !this.databaseUrl) {
      this.failRecovery(initialError);
      return;
    }
    let lastError = initialError;
    while (this.recoveryAttemptsUsed < RECOVERY_ATTEMPTS) {
      this.recoveryAttemptsUsed += 1;
      if (this.recoveryAttemptsUsed > 1) {
        await new Promise(resolve => setTimeout(resolve, RECOVERY_BACKOFF_MS));
      }
      try {
        this.detachHelperListener();
        if (kind === 'database') {
          this.update({ state: 'STARTING_POSTGRES', errorCode: undefined, diagnostic: undefined });
          await this.helper?.stop().catch(() => undefined);
          this.helper = undefined;
          await this.postgres.stop().catch(() => undefined);
          const postgresInfo = await this.postgres.start();
          this.databaseUrl = postgresInfo.databaseUrl;
        } else {
          this.helper = undefined;
        }
        this.update({ state: 'STARTING_SERVER', errorCode: undefined, diagnostic: undefined });
        const helperInfo = await this.startHelperWithRetry(this.databaseUrl, port);
        if (helperInfo.port !== port) throw new Error('Recovered helper changed the game port');
        this.update({ state: 'HOSTING', errorCode: undefined, diagnostic: undefined });
        this.refreshNetwork();
        this.startHealthMonitor();
        return;
      } catch (error) {
        lastError = error;
      }
    }
    this.failRecovery(lastError);
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
    try {
      if (this.postgres && this.postgres.state !== 'STOPPED') await this.postgres.stop();
    } catch (error) {
      firstError ??= error;
    }
    this.databaseUrl = undefined;
    if (firstError) {
      this.update({
        state: 'FAILED',
        errorCode: classifyHostRuntimeError(firstError),
        diagnostic: safeDiagnostic(firstError),
      });
      throw firstError instanceof Error ? firstError : new Error(errorText(firstError));
    }
    this.recoveryAttemptsUsed = 0;
    this.update({
      state: 'IDLE',
      gamePort: null,
      localEndpoint: null,
      lanAvailable: false,
      interfaces: [],
      advertisedEndpoints: [],
      selectedLanUrl: null,
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
