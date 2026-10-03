import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildRoomHereReply,
  DiscoveryRateLimiter,
  LAN_DISCOVERY_MAX_REQUEST_BYTES,
  LAN_DISCOVERY_PORT,
  parseFindRoomRequest,
  shouldStartLanDiscovery,
  startLanDiscoveryResponder,
  TokenBucket,
  type LanDiscoveryResponder,
} from './lanDiscoveryResponder.js';

interface Remote {
  address: string;
  port: number;
}

class FakeSocket extends EventEmitter {
  readonly bindCalls: Array<{ port: number; address: string }> = [];

  readonly sent: Array<{ payload: Buffer; port: number; address: string }> = [];

  closeCalls = 0;

  boundPort = LAN_DISCOVERY_PORT;

  constructor(private readonly bindError?: Error) {
    super();
  }

  bind(port: number, address: string): this {
    this.bindCalls.push({ port, address });
    queueMicrotask(() => {
      if (this.bindError) this.emit('error', this.bindError);
      else this.emit('listening');
    });
    return this;
  }

  address(): { port: number } {
    return { port: this.boundPort };
  }

  send(payload: Buffer, port: number, address: string, callback?: (error: Error | null) => void): void {
    this.sent.push({ payload, port, address });
    callback?.(null);
  }

  close(callback?: () => void): this {
    this.closeCalls += 1;
    callback?.();
    return this;
  }

  deliver(message: Buffer | string | object, remote: Remote = { address: '192.168.1.20', port: 50_000 }): void {
    const payload = Buffer.isBuffer(message)
      ? message
      : Buffer.from(typeof message === 'string' ? message : JSON.stringify(message), 'utf8');
    this.emit('message', payload, { ...remote, family: 'IPv4', size: payload.byteLength });
  }
}

function asDgram(socket: FakeSocket): dgram.Socket {
  return socket as unknown as dgram.Socket;
}

function request(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    app: 'own-the-block',
    type: 'find-room',
    v: 1,
    protocol: 9,
    roomCode: 'OTB-ABC234',
    nonce: 'AbCdEfGhIjKlMnOp',
    ...overrides,
  };
}

const flush = (): Promise<void> => new Promise(resolve => { setImmediate(resolve); });

const started: LanDiscoveryResponder[] = [];

afterEach(async () => {
  await Promise.all(started.splice(0).map(responder => responder.close()));
  vi.restoreAllMocks();
});

async function start(
  overrides: Partial<Parameters<typeof startLanDiscoveryResponder>[0]> = {},
  socket = new FakeSocket(),
) {
  const findRoom = vi.fn(() => Promise.resolve(true));
  const log = vi.fn();
  const responder = await startLanDiscoveryResponder({
    gamePort: 53_120,
    findRoom,
    log,
    socketFactory: () => asDgram(socket),
    ...overrides,
  });
  if (responder) started.push(responder);
  return { responder, socket, findRoom, log };
}

describe('find-room request parsing', () => {
  it('accepts exactly one well-formed request and canonicalizes the room code', () => {
    expect(parseFindRoomRequest(Buffer.from(JSON.stringify(request({ roomCode: 'otb-abc234' })))))
      .toEqual({ roomCode: 'OTB-ABC234', nonce: 'AbCdEfGhIjKlMnOp' });
  });

  it('accepts a request of exactly 256 bytes and refuses 257', () => {
    const json = JSON.stringify(request());
    const padded = (size: number) => Buffer.from(`${json}${' '.repeat(size - Buffer.byteLength(json))}`);

    expect(parseFindRoomRequest(padded(LAN_DISCOVERY_MAX_REQUEST_BYTES))).toBeDefined();
    expect(parseFindRoomRequest(padded(LAN_DISCOVERY_MAX_REQUEST_BYTES + 1))).toBeUndefined();
  });

  it.each([
    ['an empty datagram', ''],
    ['text that is not JSON', 'find-room OTB-ABC234'],
    ['a JSON array', JSON.stringify([request()])],
    ['a JSON string', JSON.stringify('find-room')],
    ['JSON null', 'null'],
    ['another app', JSON.stringify(request({ app: 'other-game' }))],
    ['another message type', JSON.stringify(request({ type: 'room-here' }))],
    ['another wire version', JSON.stringify(request({ v: 2 }))],
    ['a missing field', JSON.stringify({ ...request(), nonce: undefined })],
    ['an extra field', JSON.stringify(request({ token: 'secret' }))],
    ['a zero protocol', JSON.stringify(request({ protocol: 0 }))],
    ['a fractional protocol', JSON.stringify(request({ protocol: 9.5 }))],
    ['a text protocol', JSON.stringify(request({ protocol: '9' }))],
    ['an oversized protocol', JSON.stringify(request({ protocol: 1_001 }))],
    ['an empty room code', JSON.stringify(request({ roomCode: '' }))],
    ['a room code with spaces', JSON.stringify(request({ roomCode: 'OTB ABC' }))],
    ['a room code with symbols', JSON.stringify(request({ roomCode: 'OTB_ABC!' }))],
    ['a 21-character room code', JSON.stringify(request({ roomCode: 'A'.repeat(21) }))],
    ['a short nonce', JSON.stringify(request({ nonce: 'abc' }))],
    ['a long nonce', JSON.stringify(request({ nonce: 'a'.repeat(33) }))],
    ['a nonce with symbols', JSON.stringify(request({ nonce: 'abcdefgh!!' }))],
    ['a numeric nonce', JSON.stringify(request({ nonce: 12_345_678 }))],
  ])('drops %s', (_name, payload) => {
    expect(parseFindRoomRequest(Buffer.from(payload))).toBeUndefined();
  });
});

describe('room-here reply', () => {
  it('carries the echoed nonce and the game port, nothing else', () => {
    const reply = buildRoomHereReply('AbCdEfGhIjKlMnOp', 53_120);

    expect(JSON.parse(reply.toString('utf8'))).toEqual({
      app: 'own-the-block',
      type: 'room-here',
      v: 1,
      nonce: 'AbCdEfGhIjKlMnOp',
      port: 53_120,
    });
    expect(reply.byteLength).toBeLessThan(LAN_DISCOVERY_MAX_REQUEST_BYTES / 2);
  });
});

describe('discovery rate limits', () => {
  it('refills a bucket with time and never above its capacity', () => {
    const bucket = new TokenBucket(3, 1, 0);

    expect([bucket.tryTake(0), bucket.tryTake(0), bucket.tryTake(0), bucket.tryTake(0)])
      .toEqual([true, true, true, false]);
    expect(bucket.tryTake(500)).toBe(false);
    expect(bucket.tryTake(1_000)).toBe(true);
    expect(bucket.tryTake(60_000)).toBe(true);
    expect([bucket.tryTake(60_000), bucket.tryTake(60_000), bucket.tryTake(60_000)]).toEqual([true, true, false]);
  });

  it('limits each sender and all senders together', () => {
    const limits = { source: { capacity: 2, refillPerSecond: 0 }, global: { capacity: 5, refillPerSecond: 0 } };
    const limiter = new DiscoveryRateLimiter(0, limits);

    expect([limiter.allow('10.0.0.1', 0), limiter.allow('10.0.0.1', 0), limiter.allow('10.0.0.1', 0)])
      .toEqual([true, true, false]);
    expect([limiter.allow('10.0.0.2', 0), limiter.allow('10.0.0.2', 0)]).toEqual([true, true]);
    // Five of the global budget are spent; a fresh sender is refused too.
    expect(limiter.allow('10.0.0.3', 0)).toBe(true);
    expect(limiter.allow('10.0.0.4', 0)).toBe(false);
  });

  it('keeps a bounded number of senders and forgets the oldest first', () => {
    const limits = { source: { capacity: 1, refillPerSecond: 0 }, global: { capacity: 10_000, refillPerSecond: 0 } };
    const limiter = new DiscoveryRateLimiter(0, limits);

    expect(limiter.allow('first', 0)).toBe(true);
    expect(limiter.allow('first', 0)).toBe(false);
    for (let index = 0; index < 200; index += 1) limiter.allow(`sender-${String(index)}`, 0);
    // The oldest entry was evicted, so a sender that comes back starts again with a full bucket.
    expect(limiter.allow('first', 0)).toBe(true);
  });
});

describe('LAN discovery responder', () => {
  it('listens on the discovery port of every interface and reports it', async () => {
    const { responder, socket } = await start();

    expect(socket.bindCalls).toEqual([{ port: 41_234, address: '0.0.0.0' }]);
    expect(responder?.port).toBe(41_234);
  });

  it('only runs for the desktop Host profile', () => {
    expect(shouldStartLanDiscovery({ SERVER_RUNTIME_PROFILE: 'desktop' })).toBe(true);
    expect(shouldStartLanDiscovery({ SERVER_RUNTIME_PROFILE: ' desktop ' })).toBe(true);
    expect(shouldStartLanDiscovery({ SERVER_RUNTIME_PROFILE: 'cloud' })).toBe(false);
    expect(shouldStartLanDiscovery({ SERVER_RUNTIME_PROFILE: 'development' })).toBe(false);
    expect(shouldStartLanDiscovery({})).toBe(false);
  });

  it('answers the sender by unicast when it holds the room, with the nonce and the game port only', async () => {
    const { socket, findRoom } = await start();

    socket.deliver(request({ roomCode: 'otb-abc234' }), { address: '192.168.1.20', port: 51_000 });
    await flush();

    expect(findRoom).toHaveBeenCalledExactlyOnceWith('OTB-ABC234');
    expect(socket.sent).toHaveLength(1);
    expect(socket.sent[0]).toMatchObject({ port: 51_000, address: '192.168.1.20' });
    const reply = JSON.parse(socket.sent[0].payload.toString('utf8')) as Record<string, unknown>;
    expect(Object.keys(reply).sort()).toEqual(['app', 'nonce', 'port', 'type', 'v']);
    expect(reply).toEqual({
      app: 'own-the-block', type: 'room-here', v: 1, nonce: 'AbCdEfGhIjKlMnOp', port: 53_120,
    });
  });

  it('does not echo the room code or reveal any room, player, session or database detail', async () => {
    // The Host helper reduces the database record to a boolean before the responder sees it, so a reply can only ever
    // contain the request nonce and the game port.
    const { socket } = await start();

    socket.deliver(request());
    await flush();

    const text = socket.sent[0].payload.toString('utf8');
    for (const forbidden of ['OTB-ABC234', 'roomCode', 'status', 'host', 'player', 'name', 'token', 'hash', 'postgres', 'database']) {
      expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('stays silent for a room it does not hold', async () => {
    const findRoom = vi.fn(() => Promise.resolve(false));
    const { socket } = await start({ findRoom });

    socket.deliver(request({ roomCode: 'NOPE-0000' }));
    await flush();

    expect(findRoom).toHaveBeenCalledOnce();
    expect(socket.sent).toEqual([]);
  });

  it('drops malformed, oversized and foreign datagrams without touching the database', async () => {
    const { socket, findRoom } = await start();

    socket.deliver('hello');
    socket.deliver(Buffer.alloc(LAN_DISCOVERY_MAX_REQUEST_BYTES + 1, 0x20));
    socket.deliver(request({ app: 'someone-else' }));
    socket.deliver(request({ extra: true }));
    socket.deliver(request({ roomCode: '../etc/passwd' }));
    await flush();

    expect(findRoom).not.toHaveBeenCalled();
    expect(socket.sent).toEqual([]);
  });

  it('answers a request of another protocol version, so the handshake can explain the mismatch', async () => {
    const { socket } = await start();

    socket.deliver(request({ protocol: 10 }));
    await flush();

    expect(socket.sent).toHaveLength(1);
  });

  it('limits one noisy sender before it can reach the database', async () => {
    let clock = 1_000;
    const { socket, findRoom } = await start({ now: () => clock });
    const burst = async (): Promise<void> => {
      for (let count = 0; count < 40; count += 1) {
        socket.deliver(request(), { address: '192.168.1.99', port: 50_000 });
        await flush();
      }
    };

    await burst();
    expect(findRoom).toHaveBeenCalledTimes(8);
    expect(socket.sent).toHaveLength(8);

    // The bucket refills with time, so the sender is served again later.
    clock += 2_000;
    await burst();
    expect(findRoom).toHaveBeenCalledTimes(12);
  });

  it('limits all senders together, and garbage spends the same budget as real requests', async () => {
    const { socket, findRoom } = await start({ now: () => 1_000 });

    for (let sender = 0; sender < 60; sender += 1) {
      socket.deliver(sender % 2 === 0 ? request() : 'garbage', { address: `192.168.1.${String(sender + 10)}`, port: 50_000 });
      await flush();
    }

    // Twenty datagrams fit the global budget; half of them were garbage.
    expect(findRoom).toHaveBeenCalledTimes(10);
  });

  it('runs at most four lookups at the same time', async () => {
    const pending: Array<(found: boolean) => void> = [];
    const findRoom = vi.fn(() => new Promise<boolean>(resolve => { pending.push(resolve); }));
    const { socket } = await start({ findRoom, now: () => 1_000 });

    for (let sender = 0; sender < 10; sender += 1) {
      socket.deliver(request(), { address: `192.168.1.${String(sender + 10)}`, port: 50_000 });
    }
    await flush();
    expect(findRoom).toHaveBeenCalledTimes(4);

    for (const resolve of pending.splice(0)) resolve(true);
    await flush();
    expect(socket.sent).toHaveLength(4);

    socket.deliver(request(), { address: '192.168.1.200', port: 50_000 });
    await flush();
    expect(findRoom).toHaveBeenCalledTimes(5);
  });

  it('stays silent and keeps serving when the database lookup fails', async () => {
    const findRoom = vi.fn()
      .mockRejectedValueOnce(new Error('connection to postgres://secret failed'))
      .mockResolvedValue(true);
    const { socket, log } = await start({ findRoom, now: () => 1_000 });

    socket.deliver(request(), { address: '192.168.1.20', port: 50_000 });
    await flush();
    expect(socket.sent).toEqual([]);

    socket.deliver(request(), { address: '192.168.1.21', port: 50_000 });
    await flush();
    expect(socket.sent).toHaveLength(1);
    expect(log).not.toHaveBeenCalled();
  });

  it('treats a lookup that throws instead of rejecting as a silent drop, never as an uncaught error', async () => {
    const findRoom = vi.fn(() => { throw new Error('pool is closed'); });
    const { socket } = await start({ findRoom: findRoom as unknown as (roomCode: string) => Promise<boolean>, now: () => 1_000 });

    expect(() => socket.deliver(request())).not.toThrow();
    await flush();

    expect(findRoom).toHaveBeenCalledOnce();
    expect(socket.sent).toEqual([]);
  });

  it('closes its socket once and ignores every request, and a late lookup answer, after that', async () => {
    let finish: (found: boolean) => void = () => undefined;
    const findRoom = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const { responder, socket } = await start({ findRoom });

    socket.deliver(request());
    await responder?.close();
    await responder?.close();
    expect(socket.closeCalls).toBe(1);

    finish(true);
    socket.deliver(request({ nonce: 'ZyXwVuTsRqPoNmLk' }), { address: '192.168.1.77', port: 50_000 });
    await flush();

    expect(socket.sent).toEqual([]);
    expect(findRoom).toHaveBeenCalledOnce();
  });

  it('turns discovery off quietly when the port cannot be bound', async () => {
    const socket = new FakeSocket(Object.assign(new Error('bind EADDRINUSE 0.0.0.0:41234'), { code: 'EADDRINUSE' }));
    const { responder, log, findRoom } = await start({}, socket);

    expect(responder).toBeUndefined();
    expect(socket.closeCalls).toBe(1);
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0]?.[0])).toBe('LAN room discovery is off (EADDRINUSE); hosting is unaffected.');
    expect(findRoom).not.toHaveBeenCalled();
  });

  it('turns discovery off when a socket cannot even be created, and for an unusable game port', async () => {
    const log = vi.fn();
    const failing = await startLanDiscoveryResponder({
      gamePort: 53_120,
      findRoom: () => Promise.resolve(true),
      log,
      socketFactory: () => { throw Object.assign(new Error('no udp'), { code: 'EPERM' }); },
    });
    expect(failing).toBeUndefined();
    expect(log).toHaveBeenCalledWith('LAN room discovery is off (EPERM); hosting is unaffected.');

    const socketFactory = vi.fn(() => asDgram(new FakeSocket()));
    for (const gamePort of [0, 70_000, 1.5]) {
      await expect(startLanDiscoveryResponder({
        gamePort, findRoom: () => Promise.resolve(true), log, socketFactory,
      })).resolves.toBeUndefined();
    }
    expect(socketFactory).not.toHaveBeenCalled();
  });

  it('reports a network error after start once, without stopping', async () => {
    const { socket, log } = await start({ now: () => 1_000 });

    socket.emit('error', Object.assign(new Error('boom'), { code: 'ECONNRESET' }));
    socket.emit('error', new Error('again'));
    socket.deliver(request());
    await flush();

    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('LAN room discovery hit a network error (ECONNRESET); hosting is unaffected.');
    expect(socket.sent).toHaveLength(1);
  });
});

describe('LAN discovery responder over a real loopback socket', () => {
  it('answers a unicast request from the discovery port and ignores an unknown room', async () => {
    const findRoom = vi.fn((roomCode: string) => Promise.resolve(roomCode === 'OTB-ABC234'));
    const responder = await startLanDiscoveryResponder({
      gamePort: 53_120,
      findRoom,
      host: '127.0.0.1',
      discoveryPort: 0,
      log: () => undefined,
    });
    expect(responder).toBeDefined();
    if (responder) started.push(responder);

    const client = dgram.createSocket('udp4');
    const received: Array<{ message: Buffer; port: number; address: string }> = [];
    client.on('message', (message, remote) => { received.push({ message, port: remote.port, address: remote.address }); });
    await new Promise<void>(resolve => { client.bind(0, '127.0.0.1', resolve); });
    const send = (payload: object): Promise<void> => new Promise((resolve, reject) => {
      client.send(Buffer.from(JSON.stringify(payload)), responder?.port ?? 0, '127.0.0.1', error => {
        if (error) reject(error);
        else resolve();
      });
    });
    try {
      await send(request({ roomCode: 'NOPE-0000', nonce: 'unknown-room-nonce' }));
      await send(request({ nonce: 'known-room-nonce1' }));
      await vi.waitFor(() => expect(received).toHaveLength(1), { timeout: 2_000 });

      expect(received[0]).toMatchObject({ port: responder?.port, address: '127.0.0.1' });
      expect(JSON.parse(received[0].message.toString('utf8'))).toEqual({
        app: 'own-the-block', type: 'room-here', v: 1, nonce: 'known-room-nonce1', port: 53_120,
      });
      expect(findRoom).toHaveBeenCalledTimes(2);
    } finally {
      client.close();
    }
  });
});
