import dgram from 'node:dgram';
import { randomUUID } from 'node:crypto';

import {
  advertisedEndpoints,
  isPrivateIPv4,
  resolveNetworkInterfaces,
  type NetworkInterfaceCandidate,
} from './networkInterfaces';

export const LAN_DISCOVERY_PORT = 41_234;
export const LAN_DISCOVERY_VERSION = 1 as const;
export const LAN_DISCOVERY_TTL_MS = 5_000;
const LAN_DISCOVERY_INTERVAL_MS = 1_500;
const SAFE_ROOM_CODE = /^[A-Z0-9-]{1,20}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface DiscoveryAdvertisement {
  type: 'own-the-block-lan';
  version: typeof LAN_DISCOVERY_VERSION;
  instanceId: string;
  appVersion: string;
  protocolVersion: 8;
  roomCode: string;
  port: number;
  endpoints: string[];
  expiresInMs: typeof LAN_DISCOVERY_TTL_MS;
}

export interface DiscoveredLanGame {
  gameId: string;
  roomCode: string;
  appVersion: string;
  protocolVersion: 8;
  endpoints: string[];
  lastSeenAt: number;
}

export interface DiscoveryStatus {
  browsing: boolean;
  advertising: boolean;
  games: DiscoveredLanGame[];
}

export type DiscoveryOperationResult = { ok: true } | { ok: false; code: 'UNAVAILABLE' | 'FAILED' };

interface DiscoverySocket {
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'message', listener: (message: Buffer, remote: { address: string }) => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
  off(event: 'error', listener: (error: Error) => void): this;
  bind(port: number, address: string, callback: () => void): this;
  send(message: Buffer, port: number, address: string, callback?: (error: Error | null) => void): void;
  setBroadcast(value: boolean): void;
  close(callback?: () => void): this;
}

type SocketFactory = () => DiscoverySocket;
type Clock = () => number;
type InterfaceProvider = () => NetworkInterfaceCandidate[];

export interface LanDiscoveryOptions {
  appVersion: string;
  instanceId?: string;
  socketFactory?: SocketFactory;
  interfaceProvider?: InterfaceProvider;
  now?: Clock;
  discoveryPort?: number;
}

function safeAppVersion(value: string): string {
  return value.trim().slice(0, 64) || 'unknown';
}

export function normalizeRoomCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const roomCode = value.trim().toUpperCase();
  return SAFE_ROOM_CODE.test(roomCode) ? roomCode : undefined;
}

function safeEndpoint(value: unknown, port: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'http:' || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash
    || !isPrivateIPv4(parsed.hostname)) return undefined;
  const parsedPort = parsed.port ? Number(parsed.port) : 80;
  if (parsedPort !== port) return undefined;
  return `http://${parsed.hostname}:${String(parsedPort)}`;
}

export function serializeAdvertisement(advertisement: DiscoveryAdvertisement): Buffer {
  return Buffer.from(JSON.stringify(advertisement), 'utf8');
}

export function parseAdvertisement(
  payload: Buffer | string,
  now = Date.now(),
): DiscoveredLanGame | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof payload === 'string' ? payload : payload.toString('utf8'));
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const record = parsed as Record<string, unknown>;
  const roomCode = normalizeRoomCode(record.roomCode);
  const port = record.port;
  if (record.type !== 'own-the-block-lan'
    || record.version !== LAN_DISCOVERY_VERSION
    || typeof record.instanceId !== 'string'
    || !UUID.test(record.instanceId)
    || typeof record.appVersion !== 'string'
    || record.appVersion.length > 64
    || record.protocolVersion !== 8
    || record.expiresInMs !== LAN_DISCOVERY_TTL_MS
    || !roomCode
    || typeof port !== 'number'
    || !Number.isSafeInteger(port)
    || port < 1
    || port > 65_535
    || !Array.isArray(record.endpoints)) return undefined;

  const endpoints = [...new Set(
    record.endpoints
      .map(endpoint => safeEndpoint(endpoint, port))
      .filter((endpoint): endpoint is string => endpoint !== undefined),
  )];
  if (endpoints.length === 0) return undefined;

  return {
    gameId: record.instanceId,
    roomCode,
    appVersion: record.appVersion,
    protocolVersion: 8,
    endpoints,
    lastSeenAt: now,
  };
}

function closeSocket(socket: DiscoverySocket | undefined): Promise<void> {
  if (!socket) return Promise.resolve();
  return new Promise(resolve => {
    try {
      socket.close(resolve);
    } catch {
      resolve();
    }
  });
}

function bindSocket(socket: DiscoverySocket, port: number, address: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleError = (error: Error): void => {
      socket.off('error', handleError);
      reject(error);
    };
    socket.once('error', handleError);
    socket.bind(port, address, () => {
      socket.off('error', handleError);
      resolve();
    });
  });
}

interface PreparedAdvertisement {
  advertisement: DiscoveryAdvertisement;
  interfaces: NetworkInterfaceCandidate[];
}

export class LANDiscoveryController {
  private readonly appVersion: string;

  private readonly instanceId: string;

  private readonly socketFactory: SocketFactory;

  private readonly interfaceProvider: InterfaceProvider;

  private readonly now: Clock;

  private readonly discoveryPort: number;

  private browseSocket: DiscoverySocket | undefined;

  private advertiseSocket: DiscoverySocket | undefined;

  private browsePromise: Promise<void> | undefined;

  private browseStopPromise: Promise<void> | undefined;

  private browseGeneration = 0;

  private advertisePromise: Promise<void> | undefined;

  private advertiseStopPromise: Promise<void> | undefined;

  private advertiseGeneration = 0;

  private expireTimer: ReturnType<typeof setInterval> | undefined;

  private advertiseTimer: ReturnType<typeof setInterval> | undefined;

  private games = new Map<string, DiscoveredLanGame>();

  private readonly listeners = new Set<(games: DiscoveredLanGame[]) => void>();

  private advertisement: DiscoveryAdvertisement | undefined;

  public constructor(options: LanDiscoveryOptions) {
    this.appVersion = safeAppVersion(options.appVersion);
    this.instanceId = options.instanceId ?? randomUUID();
    this.socketFactory = options.socketFactory
      ?? (() => dgram.createSocket('udp4'));
    this.interfaceProvider = options.interfaceProvider ?? (() => resolveNetworkInterfaces());
    this.now = options.now ?? Date.now;
    this.discoveryPort = options.discoveryPort ?? LAN_DISCOVERY_PORT;
  }

  public get status(): DiscoveryStatus {
    return {
      browsing: this.browseSocket !== undefined,
      advertising: this.advertiseSocket !== undefined,
      games: this.getGames(),
    };
  }

  public getGames(): DiscoveredLanGame[] {
    this.expireGames();
    return [...this.games.values()]
      .sort((left, right) => left.roomCode.localeCompare(right.roomCode) || left.gameId.localeCompare(right.gameId))
      .map(game => ({ ...game, endpoints: [...game.endpoints] }));
  }

  public onGamesChanged(listener: (games: DiscoveredLanGame[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public startBrowsing(): Promise<void> {
    if (this.browseStopPromise) {
      return this.browseStopPromise.then(() => this.startBrowsing());
    }
    if (this.browseSocket) return Promise.resolve();
    if (this.browsePromise) return this.browsePromise;
    const generation = this.browseGeneration;
    this.browsePromise = this.startBrowsingInternal(generation).finally(() => {
      this.browsePromise = undefined;
    });
    return this.browsePromise;
  }

  public stopBrowsing(): Promise<void> {
    this.browseGeneration += 1;
    if (this.expireTimer) clearInterval(this.expireTimer);
    this.expireTimer = undefined;
    this.games.clear();
    this.emitGamesChanged();
    if (this.browseStopPromise) return this.browseStopPromise;
    const pendingStart = this.browsePromise;
    this.browseStopPromise = (async () => {
      await pendingStart?.catch(() => undefined);
      if (this.expireTimer) clearInterval(this.expireTimer);
      this.expireTimer = undefined;
      const socket = this.browseSocket;
      this.browseSocket = undefined;
      await closeSocket(socket);
    })().finally(() => {
      this.browseStopPromise = undefined;
    });
    return this.browseStopPromise;
  }

  public async startAdvertising(options: { roomCode: string; port: number }): Promise<void> {
    const prepared = this.prepareAdvertisement(options);
    if (this.advertiseStopPromise) {
      await this.advertiseStopPromise;
      return this.startAdvertising(options);
    }
    if (this.advertiseSocket) {
      this.advertisement = prepared.advertisement;
      this.sendAdvertisement(prepared.interfaces);
      return;
    }
    if (this.advertisePromise) {
      await this.advertisePromise;
      if (this.advertiseSocket) {
        this.advertisement = prepared.advertisement;
        this.sendAdvertisement(prepared.interfaces);
      }
      return;
    }
    const generation = this.advertiseGeneration;
    this.advertisePromise = this.startAdvertisingInternal(prepared, generation).finally(() => {
      this.advertisePromise = undefined;
    });
    await this.advertisePromise;
  }

  public stopAdvertising(): Promise<void> {
    this.advertiseGeneration += 1;
    if (this.advertiseTimer) clearInterval(this.advertiseTimer);
    this.advertiseTimer = undefined;
    if (this.advertiseStopPromise) return this.advertiseStopPromise;
    const pendingStart = this.advertisePromise;
    this.advertiseStopPromise = (async () => {
      await pendingStart?.catch(() => undefined);
      if (this.advertiseTimer) clearInterval(this.advertiseTimer);
      this.advertiseTimer = undefined;
      const socket = this.advertiseSocket;
      this.advertiseSocket = undefined;
      this.advertisement = undefined;
      await closeSocket(socket);
    })().finally(() => {
      this.advertiseStopPromise = undefined;
    });
    return this.advertiseStopPromise;
  }

  public async dispose(): Promise<void> {
    await Promise.all([this.stopBrowsing(), this.stopAdvertising()]);
    this.listeners.clear();
  }

  private async startBrowsingInternal(generation: number): Promise<void> {
    const socket = this.socketFactory();
    socket.on('error', () => undefined);
    socket.on('message', message => {
      if (generation !== this.browseGeneration) return;
      const game = parseAdvertisement(message, this.now());
      if (!game) return;
      this.games.set(game.gameId, game);
      this.emitGamesChanged();
    });
    try {
      await bindSocket(socket, this.discoveryPort, '0.0.0.0');
      if (generation !== this.browseGeneration) {
        await closeSocket(socket);
        return;
      }
      socket.setBroadcast(true);
      if (generation !== this.browseGeneration) {
        await closeSocket(socket);
        return;
      }
      this.browseSocket = socket;
      this.expireTimer = setInterval(() => this.expireGames(), 1_000);
    } catch (error) {
      if (this.browseSocket === socket) this.browseSocket = undefined;
      await closeSocket(socket).catch(() => undefined);
      throw error;
    }
  }

  private prepareAdvertisement(options: { roomCode: string; port: number }): PreparedAdvertisement {
    const roomCode = normalizeRoomCode(options.roomCode);
    if (!roomCode) throw new Error('LAN room code is invalid');
    if (!Number.isSafeInteger(options.port) || options.port < 1 || options.port > 65_535) {
      throw new Error('LAN game port is invalid');
    }
    const interfaces = this.interfaceProvider();
    if (interfaces.length === 0) throw new Error('No usable private LAN interface was found');
    return {
      advertisement: {
        type: 'own-the-block-lan',
        version: LAN_DISCOVERY_VERSION,
        instanceId: this.instanceId,
        appVersion: this.appVersion,
        protocolVersion: 8,
        roomCode,
        port: options.port,
        endpoints: advertisedEndpoints(interfaces, options.port),
        expiresInMs: LAN_DISCOVERY_TTL_MS,
      },
      interfaces,
    };
  }

  private async startAdvertisingInternal(
    prepared: PreparedAdvertisement,
    generation: number,
  ): Promise<void> {
    const socket = this.socketFactory();
    socket.on('error', () => undefined);
    try {
      await bindSocket(socket, 0, '0.0.0.0');
      if (generation !== this.advertiseGeneration) {
        await closeSocket(socket);
        return;
      }
      socket.setBroadcast(true);
      if (generation !== this.advertiseGeneration) {
        await closeSocket(socket);
        return;
      }
      this.advertiseSocket = socket;
      this.advertisement = prepared.advertisement;
      this.sendAdvertisement(prepared.interfaces);
      this.advertiseTimer = setInterval(() => this.sendAdvertisement(), LAN_DISCOVERY_INTERVAL_MS);
    } catch (error) {
      if (this.advertiseTimer) clearInterval(this.advertiseTimer);
      this.advertiseTimer = undefined;
      if (this.advertiseSocket === socket) this.advertiseSocket = undefined;
      this.advertisement = undefined;
      await closeSocket(socket).catch(() => undefined);
      throw error;
    }
  }

  private sendAdvertisement(interfaces = this.interfaceProvider()): void {
    const socket = this.advertiseSocket;
    if (!socket || !this.advertisement) return;
    if (interfaces.length === 0) return;
    this.advertisement = {
      ...this.advertisement,
      endpoints: advertisedEndpoints(interfaces, this.advertisement.port),
    };
    const advertisement = this.advertisement;
    const payload = serializeAdvertisement(advertisement);
    const targets = new Set(['255.255.255.255']);
    for (const candidate of interfaces) targets.add(candidate.broadcast);
    for (const target of targets) {
      socket.send(payload, this.discoveryPort, target, () => undefined);
    }
  }

  private expireGames(): void {
    const cutoff = this.now() - LAN_DISCOVERY_TTL_MS;
    let changed = false;
    for (const [gameId, game] of this.games) {
      if (game.lastSeenAt < cutoff) {
        this.games.delete(gameId);
        changed = true;
      }
    }
    if (changed) this.emitGamesChanged();
  }

  private emitGamesChanged(): void {
    const games = this.getGames();
    for (const listener of this.listeners) listener(games);
  }
}
