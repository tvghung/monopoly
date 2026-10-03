import dgram from 'node:dgram';

import { roomCodeSchema } from '@monopoly/shared';
import { z } from 'zod';

/**
 * LAN room discovery, responder side (desktop Host only; the cloud and development servers never start it).
 *
 * A joining desktop app broadcasts one small JSON datagram that carries a room code and a random nonce. The Host that
 * holds that room answers the sender with its game TCP port and the same nonce; the sender takes the Host address from
 * the packet source. A reply never carries a token, a hash, a name, a player, a status, a room list or database detail,
 * and the room code is not a credential (it only appears in the request). Everything else is dropped silently.
 *
 * `apps/desktop/src/lanFinder.ts` runs in the Electron main process, which has no runtime dependencies, so it repeats
 * these wire constants; `apps/desktop/tests/lanDiscoveryContract.test.ts` imports both sides and keeps them equal.
 */
export const LAN_DISCOVERY_PORT = 41_234;
export const LAN_DISCOVERY_APP = 'own-the-block';
export const LAN_DISCOVERY_VERSION = 1;
export const LAN_DISCOVERY_REQUEST_TYPE = 'find-room';
export const LAN_DISCOVERY_REPLY_TYPE = 'room-here';
export const LAN_DISCOVERY_MAX_REQUEST_BYTES = 256;
export const LAN_DISCOVERY_NONCE_PATTERN = /^[A-Za-z0-9_-]{8,32}$/u;

export interface DiscoveryRateLimits {
  source: { capacity: number; refillPerSecond: number };
  global: { capacity: number; refillPerSecond: number };
}

/**
 * Burst size and sustained rate per sending address and for all senders together, applied before any database call.
 * One search sends at most six datagrams per interface within about a second, so a retry a few seconds later still fits.
 */
export const LAN_DISCOVERY_RATE_LIMITS: DiscoveryRateLimits = {
  source: { capacity: 8, refillPerSecond: 2 },
  global: { capacity: 20, refillPerSecond: 10 },
};
const MAX_TRACKED_SOURCES = 128;
const MAX_CONCURRENT_LOOKUPS = 4;

const findRoomRequestSchema = z.strictObject({
  app: z.literal(LAN_DISCOVERY_APP),
  type: z.literal(LAN_DISCOVERY_REQUEST_TYPE),
  v: z.literal(LAN_DISCOVERY_VERSION),
  /** The requester's socket protocol; informational, a mismatch is reported by the Socket.IO handshake instead. */
  protocol: z.number().int().min(1).max(1_000),
  roomCode: roomCodeSchema,
  nonce: z.string().regex(LAN_DISCOVERY_NONCE_PATTERN),
});

export interface FindRoomRequest {
  /** Canonical (upper-case) room code. */
  roomCode: string;
  nonce: string;
}

/** The request datagram, or undefined for anything that is not exactly a well-formed `find-room`. */
export function parseFindRoomRequest(message: Uint8Array): FindRoomRequest | undefined {
  if (message.byteLength === 0 || message.byteLength > LAN_DISCOVERY_MAX_REQUEST_BYTES) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(message).toString('utf8'));
  } catch {
    return undefined;
  }
  const parsed = findRoomRequestSchema.safeParse(json);
  return parsed.success ? { roomCode: parsed.data.roomCode, nonce: parsed.data.nonce } : undefined;
}

/** The reply datagram: the echoed nonce and the game TCP port, nothing else. */
export function buildRoomHereReply(nonce: string, gamePort: number): Buffer {
  return Buffer.from(JSON.stringify({
    app: LAN_DISCOVERY_APP,
    type: LAN_DISCOVERY_REPLY_TYPE,
    v: LAN_DISCOVERY_VERSION,
    nonce,
    port: gamePort,
  }), 'utf8');
}

export class TokenBucket {
  private tokens: number;

  private updatedAt: number;

  public constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    now: number,
  ) {
    this.tokens = capacity;
    this.updatedAt = now;
  }

  public tryTake(now: number): boolean {
    const elapsedSeconds = Math.max(0, now - this.updatedAt) / 1_000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.updatedAt = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** One bucket per sending address (bounded, oldest evicted first) plus one for all senders together. */
export class DiscoveryRateLimiter {
  private readonly global: TokenBucket;

  private readonly sources = new Map<string, TokenBucket>();

  public constructor(
    now: number,
    private readonly limits: DiscoveryRateLimits = LAN_DISCOVERY_RATE_LIMITS,
  ) {
    this.global = new TokenBucket(limits.global.capacity, limits.global.refillPerSecond, now);
  }

  public allow(source: string, now: number): boolean {
    let bucket = this.sources.get(source);
    if (!bucket) {
      if (this.sources.size >= MAX_TRACKED_SOURCES) {
        const oldest = this.sources.keys().next();
        if (!oldest.done) this.sources.delete(oldest.value);
      }
      bucket = new TokenBucket(this.limits.source.capacity, this.limits.source.refillPerSecond, now);
      this.sources.set(source, bucket);
    }
    return bucket.tryTake(now) && this.global.tryTake(now);
  }
}

export interface LanDiscoveryResponderOptions {
  /** The game's TCP port: the only value a reply reveals. */
  gamePort: number;
  /** Whether a room with this canonical code exists; the only thing the responder asks the database. */
  findRoom: (roomCode: string) => Promise<boolean>;
  discoveryPort?: number;
  host?: string;
  socketFactory?: () => dgram.Socket;
  now?: () => number;
  log?: (message: string) => void;
}

export interface LanDiscoveryResponder {
  /** The UDP port the responder listens on. */
  readonly port: number;
  close(): Promise<void>;
}

/** Only the desktop Host profile answers discovery requests. */
export function shouldStartLanDiscovery(environment: NodeJS.ProcessEnv): boolean {
  return environment.SERVER_RUNTIME_PROFILE?.trim() === 'desktop';
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? code : 'unknown';
}

function closeQuietly(socket: dgram.Socket): Promise<void> {
  return new Promise(resolve => {
    try {
      socket.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

/**
 * Starts the responder. It never rejects: when the discovery port cannot be bound (another instance without port
 * sharing, a blocked bind), it logs one short line and returns undefined, and hosting is unaffected.
 */
export async function startLanDiscoveryResponder(
  options: LanDiscoveryResponderOptions,
): Promise<LanDiscoveryResponder | undefined> {
  const log = options.log ?? ((message: string) => console.warn(message));
  const now = options.now ?? Date.now;
  if (!Number.isSafeInteger(options.gamePort) || options.gamePort < 1 || options.gamePort > 65_535) {
    log('LAN room discovery is off (invalid game port); hosting is unaffected.');
    return undefined;
  }

  let socket: dgram.Socket;
  try {
    socket = options.socketFactory?.() ?? dgram.createSocket({ type: 'udp4', reuseAddr: true });
  } catch (error) {
    log(`LAN room discovery is off (${errorCode(error)}); hosting is unaffected.`);
    return undefined;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject);
      socket.once('listening', () => {
        socket.off('error', reject);
        resolve();
      });
      socket.bind(options.discoveryPort ?? LAN_DISCOVERY_PORT, options.host ?? '0.0.0.0');
    });
  } catch (error) {
    await closeQuietly(socket);
    log(`LAN room discovery is off (${errorCode(error)}); hosting is unaffected.`);
    return undefined;
  }

  const limiter = new DiscoveryRateLimiter(now());
  let closed = false;
  let lookups = 0;
  let reportedRuntimeError = false;

  socket.on('error', error => {
    if (reportedRuntimeError) return;
    reportedRuntimeError = true;
    log(`LAN room discovery hit a network error (${errorCode(error)}); hosting is unaffected.`);
  });

  socket.on('message', (message, remote) => {
    if (closed) return;
    if (message.byteLength > LAN_DISCOVERY_MAX_REQUEST_BYTES) return;
    // The limits come first so that neither parsing nor the database can be flooded.
    if (!limiter.allow(remote.address, now())) return;
    const request = parseFindRoomRequest(message);
    if (!request) return;
    if (lookups >= MAX_CONCURRENT_LOOKUPS) return;
    lookups += 1;
    // `Promise.resolve().then` turns even a synchronous throw of the lookup into a silent drop.
    void Promise.resolve().then(() => options.findRoom(request.roomCode)).then(found => {
      if (!found || closed) return;
      socket.send(buildRoomHereReply(request.nonce, options.gamePort), remote.port, remote.address, () => undefined);
    }).catch(() => undefined).finally(() => {
      lookups -= 1;
    });
  });

  return {
    port: socket.address().port,
    async close() {
      if (closed) return;
      closed = true;
      await closeQuietly(socket);
    },
  };
}
