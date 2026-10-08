import { randomBytes } from 'node:crypto';
import dgram from 'node:dgram';

import {
  broadcastAddress,
  isInSameSubnet,
  isUsableLanIPv4,
  resolveNetworkInterfaces,
  type NetworkInterfaceCandidate,
} from './networkInterfaces';

/**
 * LAN room discovery, requester side. The joining player types a room code only; this finds the Host that holds it.
 *
 * It broadcasts a small `find-room` datagram on every usable interface, a few times within about a second, and accepts
 * a `room-here` reply only when it echoes the random nonce, comes from the discovery port, and comes from an address in
 * the subnet of the interface that received it. The Host address is the packet source; the reply only adds the game
 * port. The candidate must then answer `GET /healthz` before it is returned, so a stale or spoofed reply never reaches
 * the join form.
 *
 * The Electron main process has no runtime dependencies, so the wire constants of `apps/server/src/lanDiscoveryResponder.ts`
 * (and the socket protocol of `packages/shared`) are repeated here; `tests/lanDiscoveryContract.test.ts` imports both
 * sides and keeps them equal.
 */
export const LAN_DISCOVERY_PORT = 41_234;
export const LAN_DISCOVERY_APP = 'own-the-block';
export const LAN_DISCOVERY_VERSION = 1;
export const LAN_DISCOVERY_REQUEST_TYPE = 'find-room';
export const LAN_DISCOVERY_REPLY_TYPE = 'room-here';
export const LAN_DISCOVERY_MAX_REQUEST_BYTES = 256;
/** Mirrors `SOCKET_PROTOCOL_VERSION` of `packages/shared`. */
export const LAN_DISCOVERY_SOCKET_PROTOCOL = 12;

const LIMITED_BROADCAST_ADDRESS = '255.255.255.255';
const MAX_INTERFACES = 6;
const MAX_HEALTH_CHECKS_PER_ENDPOINT = 2;
const ROOM_CODE_PATTERN = /^[A-Za-z0-9-]{1,20}$/u;

export type LanFindRoomFailureCode = 'NOT_FOUND' | 'UNREACHABLE' | 'NO_NETWORK' | 'UNAVAILABLE';

export type LanFindRoomResult =
  | { ok: true; endpoint: string }
  | { ok: false; code: LanFindRoomFailureCode };

export interface LanFinderTiming {
  /** When each request burst is sent, in ms after the sockets are open. */
  sendOffsetsMs: readonly number[];
  /** Replies are accepted until this long after the sockets are open. */
  listenWindowMs: number;
  /** The whole search, health checks included. */
  totalMs: number;
  healthCheckTimeoutMs: number;
}

export const DEFAULT_LAN_FINDER_TIMING: LanFinderTiming = {
  sendOffsetsMs: [0, 400, 1_000],
  listenWindowMs: 2_000,
  totalMs: 3_000,
  healthCheckTimeoutMs: 1_000,
};

export interface LanFinderSocket {
  on(event: 'message', listener: (message: Buffer, remote: { address: string; port: number }) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  bind(port: number, address: string, callback: () => void): unknown;
  setBroadcast(flag: boolean): unknown;
  send(
    message: Uint8Array,
    port: number,
    address: string,
    callback?: (error: Error | null) => void,
  ): unknown;
  close(callback?: () => void): unknown;
}

export interface LanFinderOptions {
  interfaceProvider?: () => NetworkInterfaceCandidate[];
  socketFactory?: () => LanFinderSocket;
  fetch?: typeof globalThis.fetch;
  timing?: Partial<LanFinderTiming>;
  /** Defaults to the discovery port; tests and the loopback proof point it at a private responder. */
  discoveryPort?: number;
  /** Where one interface sends its request; defaults to the directed broadcast and the limited broadcast. */
  targetsFor?: (candidate: NetworkInterfaceCandidate) => string[];
  /** Whether a reply source is believable on the interface that received it; defaults to a LAN address in its subnet. */
  acceptSource?: (address: string, candidate: NetworkInterfaceCandidate) => boolean;
  createNonce?: () => string;
}

export interface LanRoomFinder {
  findRoom(roomCode: string): Promise<LanFindRoomResult>;
  cancel(): void;
}

function defaultTargets(candidate: NetworkInterfaceCandidate): string[] {
  const directed = broadcastAddress(candidate.address, candidate.netmask);
  return directed && directed !== LIMITED_BROADCAST_ADDRESS
    ? [directed, LIMITED_BROADCAST_ADDRESS]
    : [LIMITED_BROADCAST_ADDRESS];
}

function defaultAcceptSource(address: string, candidate: NetworkInterfaceCandidate): boolean {
  return isUsableLanIPv4(address) && isInSameSubnet(address, candidate.address, candidate.netmask);
}

/** The reply's game port, or undefined unless it is exactly a well-formed `room-here` for this search. */
export function parseRoomHereReply(message: Uint8Array, nonce: string): number | undefined {
  if (message.byteLength === 0 || message.byteLength > LAN_DISCOVERY_MAX_REQUEST_BYTES) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(message).toString('utf8'));
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const reply = value as Record<string, unknown>;
  const port = reply.port;
  if (Object.keys(reply).length !== 5
    || reply.app !== LAN_DISCOVERY_APP
    || reply.type !== LAN_DISCOVERY_REPLY_TYPE
    || reply.v !== LAN_DISCOVERY_VERSION
    || reply.nonce !== nonce
    || typeof port !== 'number'
    || !Number.isSafeInteger(port)
    || port < 1
    || port > 65_535) return undefined;
  return port;
}

export function buildFindRoomRequest(roomCode: string, nonce: string): Buffer {
  return Buffer.from(JSON.stringify({
    app: LAN_DISCOVERY_APP,
    type: LAN_DISCOVERY_REQUEST_TYPE,
    v: LAN_DISCOVERY_VERSION,
    protocol: LAN_DISCOVERY_SOCKET_PROTOCOL,
    roomCode,
    nonce,
  }), 'utf8');
}

interface OpenSocket {
  socket: LanFinderSocket;
  candidate: NetworkInterfaceCandidate;
}

interface SearchEnvironment {
  interfaceProvider: () => NetworkInterfaceCandidate[];
  socketFactory: () => LanFinderSocket;
  fetch: typeof globalThis.fetch;
  timing: LanFinderTiming;
  discoveryPort: number;
  targetsFor: (candidate: NetworkInterfaceCandidate) => string[];
  acceptSource: (address: string, candidate: NetworkInterfaceCandidate) => boolean;
  createNonce: () => string;
}

function closeQuietly(socket: LanFinderSocket): void {
  try {
    socket.close();
  } catch {
    // The socket may already be closed after an error.
  }
}

/** One search: open the sockets, send the bursts, verify the first believable reply, and always clean up. */
class RoomSearch {
  public readonly promise: Promise<LanFindRoomResult>;

  private resolve!: (result: LanFindRoomResult) => void;

  private settled = false;

  private windowClosed = false;

  private candidateSeen = false;

  private sendAttempts = 0;

  private sendFailures = 0;

  private readonly nonce: string;

  private readonly timers = new Set<NodeJS.Timeout>();

  private readonly sockets: OpenSocket[] = [];

  private readonly healthChecks = new Set<AbortController>();

  private readonly verifying = new Set<string>();

  private readonly attempts = new Map<string, number>();

  public constructor(
    public readonly roomCode: string,
    private readonly environment: SearchEnvironment,
  ) {
    this.nonce = environment.createNonce();
    this.promise = new Promise<LanFindRoomResult>(resolve => {
      this.resolve = resolve;
    });
    void this.run();
  }

  public get isSettled(): boolean {
    return this.settled;
  }

  public cancel(): void {
    this.finish({ ok: false, code: 'UNAVAILABLE' });
  }

  private async run(): Promise<void> {
    let candidates: NetworkInterfaceCandidate[];
    try {
      candidates = this.pickInterfaces();
    } catch {
      this.finish({ ok: false, code: 'UNAVAILABLE' });
      return;
    }
    if (candidates.length === 0) {
      this.finish({ ok: false, code: 'NO_NETWORK' });
      return;
    }

    const { timing } = this.environment;
    this.later(timing.totalMs, () => this.finish(this.conclusion()));
    await Promise.all(candidates.map(candidate => this.open(candidate)));
    if (this.settled) return;
    if (this.sockets.length === 0) {
      this.finish({ ok: false, code: 'UNAVAILABLE' });
      return;
    }

    const request = buildFindRoomRequest(this.roomCode, this.nonce);
    for (const offset of timing.sendOffsetsMs) this.later(offset, () => this.sendBurst(request));
    this.later(timing.listenWindowMs, () => {
      this.windowClosed = true;
      this.concludeWhenIdle();
    });
  }

  /** Real adapters first; virtual and VPN adapters only when nothing else exists. */
  private pickInterfaces(): NetworkInterfaceCandidate[] {
    const usable = this.environment.interfaceProvider()
      .filter(candidate => candidate.netmask !== '255.255.255.255');
    const real = usable.filter(candidate => candidate.rank <= 2);
    return (real.length > 0 ? real : usable).slice(0, MAX_INTERFACES);
  }

  /** Opens one socket on the interface; a socket that is ready is registered at once so `finish` always closes it. */
  private open(candidate: NetworkInterfaceCandidate): Promise<void> {
    return new Promise(resolve => {
      let socket: LanFinderSocket;
      try {
        socket = this.environment.socketFactory();
      } catch {
        resolve();
        return;
      }
      let ready = false;
      const fail = (): void => {
        closeQuietly(socket);
        resolve();
      };
      socket.on('error', () => {
        if (!ready) fail();
      });
      socket.on('message', (message, remote) => this.receive(candidate, message, remote));
      try {
        socket.bind(0, candidate.address, () => {
          try {
            socket.setBroadcast(true);
          } catch {
            fail();
            return;
          }
          if (this.settled) {
            fail();
            return;
          }
          ready = true;
          this.sockets.push({ socket, candidate });
          resolve();
        });
      } catch {
        fail();
      }
    });
  }

  private sendBurst(request: Buffer): void {
    if (this.settled) return;
    for (const { socket, candidate } of this.sockets) {
      for (const target of this.environment.targetsFor(candidate)) {
        this.sendAttempts += 1;
        try {
          socket.send(request, this.environment.discoveryPort, target, error => {
            if (error) this.sendFailures += 1;
          });
        } catch {
          this.sendFailures += 1;
        }
      }
    }
  }

  private receive(
    candidate: NetworkInterfaceCandidate,
    message: Buffer,
    remote: { address: string; port: number },
  ): void {
    if (this.settled || this.windowClosed) return;
    if (remote.port !== this.environment.discoveryPort) return;
    if (!this.environment.acceptSource(remote.address, candidate)) return;
    const port = parseRoomHereReply(message, this.nonce);
    if (port === undefined) return;
    this.verify(`http://${remote.address}:${String(port)}`);
  }

  private verify(endpoint: string): void {
    const tried = this.attempts.get(endpoint) ?? 0;
    if (this.verifying.has(endpoint) || tried >= MAX_HEALTH_CHECKS_PER_ENDPOINT) return;
    this.attempts.set(endpoint, tried + 1);
    this.verifying.add(endpoint);
    this.candidateSeen = true;
    void this.checkHealth(endpoint).then(healthy => {
      this.verifying.delete(endpoint);
      if (healthy) this.finish({ ok: true, endpoint });
      else this.concludeWhenIdle();
    });
  }

  private async checkHealth(endpoint: string): Promise<boolean> {
    const controller = new AbortController();
    this.healthChecks.add(controller);
    const timer = setTimeout(() => controller.abort(), this.environment.timing.healthCheckTimeoutMs);
    try {
      const response = await this.environment.fetch(`${endpoint}/healthz`, { signal: controller.signal });
      return response.status === 200 && (await response.text()) === 'ok';
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
      this.healthChecks.delete(controller);
    }
  }

  private concludeWhenIdle(): void {
    if (this.windowClosed && this.verifying.size === 0) this.finish(this.conclusion());
  }

  private conclusion(): LanFindRoomResult {
    if (this.candidateSeen) return { ok: false, code: 'UNREACHABLE' };
    // Nothing could be sent (for example the OS refuses broadcasts for this app): not "no such room", but "cannot look".
    if (this.sendAttempts === 0 || this.sendFailures === this.sendAttempts) return { ok: false, code: 'UNAVAILABLE' };
    return { ok: false, code: 'NOT_FOUND' };
  }

  private later(delayMs: number, action: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      action();
    }, delayMs);
    this.timers.add(timer);
  }

  private finish(result: LanFindRoomResult): void {
    if (this.settled) return;
    this.settled = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    for (const controller of this.healthChecks) controller.abort();
    this.healthChecks.clear();
    for (const { socket } of this.sockets) closeQuietly(socket);
    this.sockets.length = 0;
    this.resolve(result);
  }
}

/** Finds the Host of a room code on the local network. One search at a time; a new room code replaces the old search. */
export class LanFinder implements LanRoomFinder {
  private active: RoomSearch | undefined;

  private readonly environment: SearchEnvironment;

  public constructor(options: LanFinderOptions = {}) {
    this.environment = {
      interfaceProvider: options.interfaceProvider ?? (() => resolveNetworkInterfaces()),
      socketFactory: options.socketFactory ?? (() => dgram.createSocket('udp4')),
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      timing: { ...DEFAULT_LAN_FINDER_TIMING, ...options.timing },
      discoveryPort: options.discoveryPort ?? LAN_DISCOVERY_PORT,
      targetsFor: options.targetsFor ?? defaultTargets,
      acceptSource: options.acceptSource ?? defaultAcceptSource,
      createNonce: options.createNonce ?? (() => randomBytes(12).toString('base64url')),
    };
  }

  public findRoom(roomCode: string): Promise<LanFindRoomResult> {
    if (!ROOM_CODE_PATTERN.test(roomCode)) return Promise.resolve({ ok: false, code: 'NOT_FOUND' });
    const canonical = roomCode.toUpperCase();
    if (this.active && !this.active.isSettled && this.active.roomCode === canonical) return this.active.promise;
    this.active?.cancel();
    const search = new RoomSearch(canonical, this.environment);
    this.active = search;
    void search.promise.then(() => {
      if (this.active === search) this.active = undefined;
    });
    return search.promise;
  }

  public cancel(): void {
    this.active?.cancel();
    this.active = undefined;
  }
}
