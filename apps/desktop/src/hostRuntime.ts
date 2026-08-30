import { createServer } from 'node:net';
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
}

export interface HostRuntimeOptions {
  resourceRoot: string;
  helperPath: string;
  migrationDirectory: string;
  userDataPath: string;
  appVersion: string;
  platform?: DesktopPlatform;
  defaultPort?: number;
  interfaceProvider?: () => NetworkInterfaceCandidate[];
  postgres?: ManagedPostgresLike;
  helperFactory?: (databaseUrl: string, port: number) => ServerHelperLike;
  stopAdvertisement?: () => void | Promise<void>;
}

const LOOPBACK_HOST = '127.0.0.1';
const LAN_BIND_HOST = '0.0.0.0';
const DEFAULT_GAME_PORT = 8080;
const DIAGNOSTIC_LIMIT = 512;

function platformName(value: NodeJS.Platform = process.platform): DesktopPlatform {
  return value === 'darwin' || value === 'linux' ? value : 'win32';
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeDiagnostic(error: unknown): string {
  return errorText(error)
    .replace(/postgres(?:ql)?(?:\+[^:]+)?:\/\/[^\s"'`]+/giu, 'postgresql://[redacted]')
    .replace(/(DATABASE_URL|PGPASSWORD)\s*[=:]\s*[^\s]+/giu, '$1=[redacted]')
    .slice(-DIAGNOSTIC_LIMIT);
}

function validatePort(port: number): number {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Game port must be between 1 and 65535');
  }
  return port;
}

export async function assertGamePortAvailable(port: number): Promise<void> {
  validatePort(port);
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error): void => {
      server.off('listening', handleListening);
      reject(error);
    };
    const handleListening = (): void => {
      server.off('error', handleError);
      resolve();
    };
    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port, LAN_BIND_HOST);
  }).finally(() => new Promise<void>(resolve => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  }));
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
  };
}

export class HostRuntimeController {
  private currentStatus: HostRuntimeStatus;

  private postgres: ManagedPostgresLike | undefined;

  private helper: ServerHelperLike | undefined;

  private startPromise: Promise<HostRuntimeStatus> | undefined;

  private stopPromise: Promise<HostRuntimeStatus> | undefined;

  private readonly listeners = new Set<HostRuntimeListener>();

  private readonly interfaceProvider: () => NetworkInterfaceCandidate[];

  public constructor(private readonly options: HostRuntimeOptions) {
    if (!path.isAbsolute(options.resourceRoot)) throw new Error('Host PostgreSQL resource root must be absolute');
    if (!path.isAbsolute(options.helperPath)) throw new Error('Host helper path must be absolute');
    if (!path.isAbsolute(options.migrationDirectory)) throw new Error('Host migration directory must be absolute');
    if (!path.isAbsolute(options.userDataPath)) throw new Error('Host user data path must be absolute');
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
    this.startPromise = this.startInternal(options).finally(() => {
      this.startPromise = undefined;
    });
    return this.startPromise;
  }

  public async stop(): Promise<HostRuntimeStatus> {
    if (this.currentStatus.state === 'IDLE') return this.status;
    if (this.stopPromise) return this.stopPromise;
    const pendingStart = this.startPromise;
    this.stopPromise = (async () => {
      await pendingStart?.catch(() => undefined);
      return this.stopInternal();
    })().finally(() => {
      this.stopPromise = undefined;
    });
    return this.stopPromise;
  }

  public setHosting(hosting: boolean): HostRuntimeStatus {
    if (hosting && this.currentStatus.state === 'READY') this.update({ state: 'HOSTING' });
    if (!hosting && this.currentStatus.state === 'HOSTING') this.update({ state: 'READY' });
    return this.status;
  }

  private async startInternal(options: HostStartOptions): Promise<HostRuntimeStatus> {
    const port = validatePort(options.port ?? this.options.defaultPort ?? DEFAULT_GAME_PORT);
    this.update({
      state: 'STARTING_POSTGRES',
      gamePort: port,
      localEndpoint: `http://${LOOPBACK_HOST}:${String(port)}`,
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
      postgresStarted = true;
      await assertGamePortAvailable(port);
      this.update({ state: 'STARTING_SERVER' });
      this.helper = this.options.helperFactory?.(postgresInfo.databaseUrl, port)
        ?? new ServerHelperController({
          modulePath: this.options.helperPath,
          migrationDirectory: this.options.migrationDirectory,
          databaseUrl: postgresInfo.databaseUrl,
          host: LAN_BIND_HOST,
          port,
        });
      const helperInfo = await this.helper.start();
      if (helperInfo.host !== LAN_BIND_HOST || helperInfo.port !== port) {
        throw new Error('Server helper announced an unexpected LAN endpoint');
      }
      const interfaces = this.interfaceProvider();
      this.update({
        state: 'READY',
        interfaces,
        advertisedEndpoints: advertisedEndpoints(interfaces, port),
        lanAvailable: interfaces.length > 0,
        ...(interfaces.length > 0 ? {} : { errorCode: 'NO_LAN_INTERFACE' as const }),
      });
      return this.status;
    } catch (error) {
      await this.helper?.stop().catch(() => undefined);
      this.helper = undefined;
      if (postgresStarted) await this.postgres?.stop().catch(() => undefined);
      const errorCode = this.interfaceProvider().length === 0
        && errorText(error).includes('No usable')
        ? 'NO_LAN_INTERFACE'
        : classifyHostRuntimeError(error);
      this.update({
        state: 'FAILED',
        errorCode,
        diagnostic: safeDiagnostic(error),
      });
      throw error;
    }
  }

  private async stopInternal(): Promise<HostRuntimeStatus> {
    this.update({ state: 'STOPPING', errorCode: undefined, diagnostic: undefined });
    let firstError: unknown;
    try {
      await this.options.stopAdvertisement?.();
    } catch (error) {
      firstError = error;
    }
    try {
      await this.helper?.stop();
    } catch (error) {
      firstError ??= error;
    }
    this.helper = undefined;
    try {
      if (this.postgres && this.postgres.state !== 'STOPPED') await this.postgres.stop();
    } catch (error) {
      firstError ??= error;
    }
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
