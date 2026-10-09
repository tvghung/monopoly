import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildFindRoomRequest,
  DEFAULT_LAN_FINDER_TIMING,
  LAN_DISCOVERY_MAX_REQUEST_BYTES,
  LAN_DISCOVERY_PORT,
  LanFinder,
  parseRoomHereReply,
  type LanFinderOptions,
  type LanFinderSocket,
} from '../src/lanFinder';
import type { NetworkInterfaceCandidate } from '../src/networkInterfaces';

interface SentDatagram {
  payload: Buffer;
  port: number;
  address: string;
  at: number;
}

class FakeSocket extends EventEmitter implements LanFinderSocket {
  readonly sent: SentDatagram[] = [];

  readonly bindCalls: Array<{ port: number; address: string }> = [];

  broadcast: boolean | undefined;

  closeCalls = 0;

  bindError: Error | undefined;

  bindGate: Promise<void> | undefined;

  sendError: Error | undefined;

  failSendsTo = new Set<string>();

  bind(port: number, address: string, callback: () => void): this {
    this.bindCalls.push({ port, address });
    const complete = (): void => {
      if (this.bindError) this.emit('error', this.bindError);
      else callback();
    };
    if (this.bindGate) void this.bindGate.then(complete);
    else queueMicrotask(complete);
    return this;
  }

  setBroadcast(flag: boolean): void {
    this.broadcast = flag;
  }

  send(payload: Uint8Array, port: number, address: string, callback?: (error: Error | null) => void): void {
    this.sent.push({ payload: Buffer.from(payload), port, address, at: Date.now() });
    const failed = this.sendError ?? (this.failSendsTo.has(address) ? new Error('EHOSTUNREACH') : null);
    callback?.(failed);
  }

  close(callback?: () => void): this {
    this.closeCalls += 1;
    callback?.();
    return this;
  }

  /** Delivers a datagram to this socket as if a Host had answered. */
  deliver(message: unknown, remote: { address: string; port?: number }): void {
    const payload = Buffer.isBuffer(message)
      ? message
      : Buffer.from(typeof message === 'string' ? message : JSON.stringify(message), 'utf8');
    this.emit('message', payload, { address: remote.address, port: remote.port ?? LAN_DISCOVERY_PORT });
  }

  get lastRequest(): Record<string, unknown> {
    const last = this.sent.at(-1);
    return JSON.parse((last?.payload ?? Buffer.from('{}')).toString('utf8')) as Record<string, unknown>;
  }
}

const wifi: NetworkInterfaceCandidate = {
  name: 'Wi-Fi', displayName: 'Wi-Fi', address: '192.168.1.15', netmask: '255.255.255.0', preference: 'preferred', rank: 0,
};
const ethernet: NetworkInterfaceCandidate = {
  name: 'Ethernet', displayName: 'Ethernet', address: '10.0.0.8', netmask: '255.255.0.0', preference: 'preferred', rank: 1,
};
const vpn: NetworkInterfaceCandidate = {
  name: 'Tailscale', displayName: 'Tailscale', address: '100.101.102.103', netmask: '255.192.0.0', preference: 'fallback', rank: 3,
};

const NONCE = 'AbCdEfGhIjKlMnOp';

function okResponse(): Response {
  return new Response('ok', { status: 200 });
}

interface Harness {
  finder: LanFinder;
  sockets: FakeSocket[];
  fetch: ReturnType<typeof vi.fn>;
  socketFor(address: string): FakeSocket;
}

function createHarness(
  interfaces: NetworkInterfaceCandidate[] = [wifi],
  options: Partial<LanFinderOptions> = {},
  configure: (socket: FakeSocket, index: number) => void = () => undefined,
): Harness {
  const sockets: FakeSocket[] = [];
  const fetch = vi.fn(() => Promise.resolve(okResponse()));
  const finder = new LanFinder({
    interfaceProvider: () => interfaces,
    socketFactory: () => {
      const socket = new FakeSocket();
      configure(socket, sockets.length);
      sockets.push(socket);
      return socket;
    },
    fetch: fetch as unknown as typeof globalThis.fetch,
    createNonce: () => NONCE,
    ...options,
  });
  return {
    finder,
    sockets,
    fetch,
    socketFor: address => {
      const found = sockets.find(socket => socket.bindCalls[0]?.address === address);
      if (!found) throw new Error(`No socket is bound to ${address}`);
      return found;
    },
  };
}

function reply(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    app: 'own-the-block', type: 'room-here', v: 1, nonce: NONCE, port: 53_120, ...overrides,
  };
}

async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LAN room finder requests', () => {
  it('opens one broadcast socket per interface and sends the room code to both broadcast addresses three times', async () => {
    const { finder, sockets, socketFor } = createHarness([wifi, ethernet]);

    const result = finder.findRoom('otb-abc234');
    await advance(0);

    expect(sockets).toHaveLength(2);
    expect(socketFor('192.168.1.15').bindCalls).toEqual([{ port: 0, address: '192.168.1.15' }]);
    expect(socketFor('10.0.0.8').bindCalls).toEqual([{ port: 0, address: '10.0.0.8' }]);
    expect(sockets.every(socket => socket.broadcast === true)).toBe(true);

    await advance(1_000);
    const wifiSent = socketFor('192.168.1.15').sent;
    expect(wifiSent.map(item => item.address)).toEqual([
      '192.168.1.255', '255.255.255.255', '192.168.1.255', '255.255.255.255', '192.168.1.255', '255.255.255.255',
    ]);
    expect(socketFor('10.0.0.8').sent.map(item => item.address).slice(0, 2)).toEqual(['10.0.255.255', '255.255.255.255']);
    expect(wifiSent.every(item => item.port === LAN_DISCOVERY_PORT)).toBe(true);
    // 0, 400 and 1000 ms after the sockets are open, two destinations each.
    const start = wifiSent[0].at;
    expect(wifiSent.map(item => item.at - start)).toEqual([0, 0, 400, 400, 1_000, 1_000]);

    await advance(DEFAULT_LAN_FINDER_TIMING.totalMs);
    await expect(result).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('sends exactly the contract request: app, type, version, protocol, canonical room code and a nonce', async () => {
    const { finder, sockets } = createHarness([wifi]);

    void finder.findRoom('otb-abc234');
    await advance(0);

    const request = sockets[0].lastRequest;
    expect(request).toEqual({
      app: 'own-the-block', type: 'find-room', v: 1, protocol: 13, roomCode: 'OTB-ABC234', nonce: NONCE,
    });
    expect(sockets[0].sent[0].payload.byteLength).toBeLessThanOrEqual(LAN_DISCOVERY_MAX_REQUEST_BYTES);
    finder.cancel();
  });

  it('draws a different random nonce for every search', async () => {
    const sockets: FakeSocket[] = [];
    const finder = new LanFinder({
      interfaceProvider: () => [wifi],
      socketFactory: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
      fetch: vi.fn() as unknown as typeof globalThis.fetch,
    });

    void finder.findRoom('OTB-ABC234');
    await advance(0);
    finder.cancel();
    void finder.findRoom('OTB-ABC234');
    await advance(0);
    finder.cancel();

    const nonces = sockets.map(socket => String(socket.lastRequest.nonce));
    expect(nonces).toHaveLength(2);
    expect(nonces[0]).not.toBe(nonces[1]);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9_-]{16}$/u);
  });

  it('keeps the request inside the size limit for the longest room code', () => {
    expect(buildFindRoomRequest('A'.repeat(20), 'N'.repeat(32)).byteLength).toBeLessThanOrEqual(LAN_DISCOVERY_MAX_REQUEST_BYTES);
  });

  it('answers NOT_FOUND for a malformed room code without opening a socket', async () => {
    const { finder, sockets } = createHarness();

    await expect(finder.findRoom('bad code!')).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
    await expect(finder.findRoom('')).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
    await expect(finder.findRoom('A'.repeat(21))).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(sockets).toEqual([]);
  });
});

describe('LAN room finder interfaces', () => {
  it('reports NO_NETWORK at once when there is no usable interface', async () => {
    const { finder, sockets } = createHarness([]);

    await expect(finder.findRoom('OTB-ABC234')).resolves.toEqual({ ok: false, code: 'NO_NETWORK' });
    expect(sockets).toEqual([]);
  });

  it('skips virtual and VPN adapters while a real one exists, and uses them when nothing else does', async () => {
    const withReal = createHarness([vpn, wifi]);
    void withReal.finder.findRoom('OTB-ABC234');
    await advance(0);
    expect(withReal.sockets.map(socket => socket.bindCalls[0]?.address)).toEqual(['192.168.1.15']);
    withReal.finder.cancel();

    const onlyVirtual = createHarness([vpn]);
    void onlyVirtual.finder.findRoom('OTB-ABC234');
    await advance(0);
    expect(onlyVirtual.sockets.map(socket => socket.bindCalls[0]?.address)).toEqual(['100.101.102.103']);
    onlyVirtual.finder.cancel();
  });

  it('skips /32 addresses and caps the number of sockets', async () => {
    const many = Array.from({ length: 9 }, (_, index): NetworkInterfaceCandidate => ({
      ...wifi, name: `Ethernet ${String(index)}`, address: `10.${String(index)}.0.5`, netmask: '255.255.255.0', rank: 1,
    }));
    const { finder, sockets } = createHarness([{ ...wifi, address: '10.99.0.1', netmask: '255.255.255.255' }, ...many]);

    void finder.findRoom('OTB-ABC234');
    await advance(0);

    expect(sockets).toHaveLength(6);
    expect(sockets.map(socket => socket.bindCalls[0]?.address)).not.toContain('10.99.0.1');
    finder.cancel();
  });

  it('answers UNAVAILABLE when no interface can be opened, and searches on with the ones that can', async () => {
    const failing = createHarness([wifi, ethernet], {}, socket => { socket.bindError = new Error('EACCES'); });
    const failed = failing.finder.findRoom('OTB-ABC234');
    await advance(0);
    await expect(failed).resolves.toEqual({ ok: false, code: 'UNAVAILABLE' });
    expect(failing.sockets.every(socket => socket.closeCalls >= 1)).toBe(true);

    const partial = createHarness([wifi, ethernet], {}, (socket, index) => {
      if (index === 0) socket.bindError = new Error('EADDRNOTAVAIL');
    });
    const found = partial.finder.findRoom('OTB-ABC234');
    await advance(0);
    partial.socketFor('10.0.0.8').deliver(reply(), { address: '10.0.3.4' });
    await advance(0);
    await expect(found).resolves.toEqual({ ok: true, endpoint: 'http://10.0.3.4:53120' });

    const none = new LanFinder({
      interfaceProvider: () => [wifi],
      socketFactory: () => { throw new Error('no udp'); },
      fetch: vi.fn() as unknown as typeof globalThis.fetch,
    });
    await expect(none.findRoom('OTB-ABC234')).resolves.toEqual({ ok: false, code: 'UNAVAILABLE' });
  });

  it('answers UNAVAILABLE when the interface list itself cannot be read', async () => {
    const finder = new LanFinder({
      interfaceProvider: () => { throw new Error('uv_interface_addresses failed'); },
      fetch: vi.fn() as unknown as typeof globalThis.fetch,
    });

    await expect(finder.findRoom('OTB-ABC234')).resolves.toEqual({ ok: false, code: 'UNAVAILABLE' });
  });
});

describe('LAN room finder replies', () => {
  it('returns the first Host that echoes the nonce and answers the health check, and closes every socket', async () => {
    const { finder, sockets, fetch, socketFor } = createHarness([wifi, ethernet]);

    const result = finder.findRoom('OTB-ABC234');
    await advance(0);
    socketFor('192.168.1.15').deliver(reply({ port: 53_120 }), { address: '192.168.1.20' });
    await advance(0);

    await expect(result).resolves.toEqual({ ok: true, endpoint: 'http://192.168.1.20:53120' });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toBe('http://192.168.1.20:53120/healthz');
    expect(sockets.every(socket => socket.closeCalls >= 1)).toBe(true);
    // No send and no timer survive the search.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores replies with the wrong nonce, source port, source address or shape', async () => {
    const { finder, fetch, socketFor } = createHarness([wifi]);
    const result = finder.findRoom('OTB-ABC234');
    await advance(0);
    const socket = socketFor('192.168.1.15');
    const good = { address: '192.168.1.20' };

    socket.deliver(reply({ nonce: 'someone-elses-nonce' }), good);
    socket.deliver(reply(), { address: '192.168.1.20', port: 40_000 });
    socket.deliver(reply(), { address: '192.168.2.20' });
    socket.deliver(reply(), { address: '127.0.0.1' });
    socket.deliver(reply(), { address: '169.254.9.9' });
    socket.deliver(reply({ app: 'other' }), good);
    socket.deliver(reply({ type: 'find-room' }), good);
    socket.deliver(reply({ v: 2 }), good);
    socket.deliver(reply({ port: 0 }), good);
    socket.deliver(reply({ port: 65_536 }), good);
    socket.deliver(reply({ port: 5.5 }), good);
    socket.deliver(reply({ port: '53120' }), good);
    socket.deliver({ ...reply(), token: 'secret' }, good);
    socket.deliver('not json', good);
    socket.deliver(JSON.stringify([reply()]), good);
    socket.deliver(Buffer.alloc(LAN_DISCOVERY_MAX_REQUEST_BYTES + 1, 0x20), good);
    await advance(0);

    expect(fetch).not.toHaveBeenCalled();
    await advance(DEFAULT_LAN_FINDER_TIMING.listenWindowMs);
    await expect(result).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('accepts a reply on a wider subnet and refuses one from another interface\'s network', async () => {
    const { finder, socketFor } = createHarness([wifi, ethernet]);
    const result = finder.findRoom('OTB-ABC234');
    await advance(0);

    // 10.0.3.4 belongs to the Ethernet /16, not to the Wi-Fi /24 that received it.
    socketFor('192.168.1.15').deliver(reply(), { address: '10.0.3.4' });
    await advance(0);
    socketFor('10.0.0.8').deliver(reply({ port: 4_000 }), { address: '10.0.3.4' });
    await advance(0);

    await expect(result).resolves.toEqual({ ok: true, endpoint: 'http://10.0.3.4:4000' });
  });

  it('ignores a reply that arrives after the listening window', async () => {
    const { finder, fetch, socketFor } = createHarness([wifi]);
    const result = finder.findRoom('OTB-ABC234');
    await advance(0);
    const socket = socketFor('192.168.1.15');

    await advance(DEFAULT_LAN_FINDER_TIMING.listenWindowMs);
    await expect(result).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
    socket.deliver(reply(), { address: '192.168.1.20' });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('verifies the same Host once however many of its repeated replies arrive', async () => {
    const pending: Array<(response: Response) => void> = [];
    const { finder, fetch, socketFor } = createHarness([wifi]);
    fetch.mockImplementation(() => new Promise<Response>(resolve => { pending.push(resolve); }));
    const result = finder.findRoom('OTB-ABC234');
    await advance(0);
    const socket = socketFor('192.168.1.15');

    for (let count = 0; count < 6; count += 1) socket.deliver(reply(), { address: '192.168.1.20' });
    await advance(0);
    expect(fetch).toHaveBeenCalledOnce();

    pending[0](okResponse());
    await advance(0);
    await expect(result).resolves.toEqual({ ok: true, endpoint: 'http://192.168.1.20:53120' });
  });
});

describe('LAN room finder health check', () => {
  it.each([
    ['a refused connection', () => Promise.reject(new Error('ECONNREFUSED'))],
    ['an error status', () => Promise.resolve(new Response('no', { status: 503 }))],
    ['another service on that port', () => Promise.resolve(new Response('<html></html>', { status: 200 }))],
  ])('answers UNREACHABLE when the Host replies but the check fails with %s', async (_name, respond) => {
    const { finder, fetch, socketFor } = createHarness([wifi]);
    fetch.mockImplementation(respond);
    const result = finder.findRoom('OTB-ABC234');
    await advance(0);
    socketFor('192.168.1.15').deliver(reply(), { address: '192.168.1.20' });
    await advance(0);

    // The search keeps listening, then reports what it saw once the window closes.
    await advance(DEFAULT_LAN_FINDER_TIMING.listenWindowMs);
    await expect(result).resolves.toEqual({ ok: false, code: 'UNREACHABLE' });
  });

  it('retries a Host once on its next reply, and no more', async () => {
    const { finder, fetch, socketFor } = createHarness([wifi]);
    fetch.mockImplementationOnce(() => Promise.reject(new Error('ETIMEDOUT')))
      .mockImplementationOnce(() => Promise.resolve(okResponse()));
    const result = finder.findRoom('OTB-ABC234');
    await advance(0);
    const socket = socketFor('192.168.1.15');

    socket.deliver(reply(), { address: '192.168.1.20' });
    await advance(0);
    socket.deliver(reply(), { address: '192.168.1.20' });
    await advance(0);

    await expect(result).resolves.toEqual({ ok: true, endpoint: 'http://192.168.1.20:53120' });
    expect(fetch).toHaveBeenCalledTimes(2);

    const exhausted = createHarness([wifi]);
    exhausted.fetch.mockImplementation(() => Promise.reject(new Error('ECONNREFUSED')));
    const second = exhausted.finder.findRoom('OTB-ABC234');
    await advance(0);
    const other = exhausted.socketFor('192.168.1.15');
    for (let count = 0; count < 5; count += 1) {
      other.deliver(reply(), { address: '192.168.1.20' });
      await advance(0);
    }
    expect(exhausted.fetch).toHaveBeenCalledTimes(2);
    await advance(DEFAULT_LAN_FINDER_TIMING.listenWindowMs);
    await expect(second).resolves.toEqual({ ok: false, code: 'UNREACHABLE' });
  });

  it('lets one reachable Host win over another that is not', async () => {
    const { finder, fetch, socketFor } = createHarness([wifi]);
    fetch.mockImplementation((url: string) => (url.startsWith('http://192.168.1.21')
      ? Promise.resolve(okResponse())
      : Promise.reject(new Error('ECONNREFUSED'))));
    const result = finder.findRoom('OTB-ABC234');
    await advance(0);
    const socket = socketFor('192.168.1.15');

    socket.deliver(reply({ port: 5_001 }), { address: '192.168.1.20' });
    socket.deliver(reply({ port: 5_002 }), { address: '192.168.1.21' });
    await advance(0);

    await expect(result).resolves.toEqual({ ok: true, endpoint: 'http://192.168.1.21:5002' });
  });

  it('gives up on a Host that never answers the check and still ends within three seconds', async () => {
    const { finder, fetch, socketFor } = createHarness([wifi]);
    fetch.mockImplementation((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const startedAt = Date.now();
    const result = finder.findRoom('OTB-ABC234');
    await advance(0);
    socketFor('192.168.1.15').deliver(reply(), { address: '192.168.1.20' });
    await advance(0);
    expect(fetch).toHaveBeenCalledOnce();

    await advance(DEFAULT_LAN_FINDER_TIMING.listenWindowMs);
    await expect(result).resolves.toEqual({ ok: false, code: 'UNREACHABLE' });
    expect(Date.now() - startedAt).toBeLessThanOrEqual(DEFAULT_LAN_FINDER_TIMING.totalMs);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ends at the total time limit even when a check is still running at the end of the window', async () => {
    const { finder, fetch, socketFor } = createHarness([wifi], { timing: { healthCheckTimeoutMs: 60_000 } });
    fetch.mockImplementation(() => new Promise<Response>(() => undefined));
    const startedAt = Date.now();
    const result = finder.findRoom('OTB-ABC234');
    await advance(0);
    socketFor('192.168.1.15').deliver(reply(), { address: '192.168.1.20' });
    await advance(0);

    await advance(DEFAULT_LAN_FINDER_TIMING.totalMs);
    await expect(result).resolves.toEqual({ ok: false, code: 'UNREACHABLE' });
    expect(Date.now() - startedAt).toBe(DEFAULT_LAN_FINDER_TIMING.totalMs);
  });
});

describe('LAN room finder failures to look', () => {
  it('answers UNAVAILABLE when every send fails, as when the OS refuses broadcasts for the app', async () => {
    const { finder, sockets } = createHarness([wifi], {}, socket => { socket.sendError = new Error('EHOSTUNREACH'); });

    const result = finder.findRoom('OTB-ABC234');
    await advance(DEFAULT_LAN_FINDER_TIMING.totalMs);

    await expect(result).resolves.toEqual({ ok: false, code: 'UNAVAILABLE' });
    expect(sockets[0].sent.length).toBeGreaterThan(0);
  });

  it('answers NOT_FOUND when only one of the two destinations fails', async () => {
    const { finder } = createHarness([wifi], {}, socket => { socket.failSendsTo.add('255.255.255.255'); });

    const result = finder.findRoom('OTB-ABC234');
    await advance(DEFAULT_LAN_FINDER_TIMING.totalMs);

    await expect(result).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('LAN room finder lifecycle', () => {
  it('shares one search between callers that ask for the same room', async () => {
    const { finder, sockets } = createHarness([wifi]);

    const first = finder.findRoom('OTB-ABC234');
    const second = finder.findRoom('otb-abc234');
    await advance(0);

    expect(second).toBe(first);
    expect(sockets).toHaveLength(1);
    finder.cancel();
    await first;
  });

  it('replaces the running search when another room is asked for, and closes the old sockets', async () => {
    const { finder, sockets } = createHarness([wifi]);

    const first = finder.findRoom('OTB-AAAAAA');
    await advance(0);
    const second = finder.findRoom('OTB-BBBBBB');

    await expect(first).resolves.toEqual({ ok: false, code: 'UNAVAILABLE' });
    expect(sockets[0].closeCalls).toBeGreaterThanOrEqual(1);
    await advance(0);
    expect(sockets).toHaveLength(2);
    expect(sockets[1].lastRequest.roomCode).toBe('OTB-BBBBBB');

    sockets[1].deliver(reply(), { address: '192.168.1.20' });
    await advance(0);
    await expect(second).resolves.toEqual({ ok: true, endpoint: 'http://192.168.1.20:53120' });
  });

  it('can search again after a search ended', async () => {
    const { finder, sockets } = createHarness([wifi]);

    const first = finder.findRoom('OTB-ABC234');
    await advance(DEFAULT_LAN_FINDER_TIMING.totalMs);
    await first;
    const second = finder.findRoom('OTB-ABC234');
    await advance(0);

    expect(second).not.toBe(first);
    expect(sockets).toHaveLength(2);
    finder.cancel();
  });

  it('cancels a running search, closes its sockets and stops sending', async () => {
    const { finder, sockets } = createHarness([wifi]);
    const result = finder.findRoom('OTB-ABC234');
    await advance(0);
    const sentBefore = sockets[0].sent.length;

    finder.cancel();

    await expect(result).resolves.toEqual({ ok: false, code: 'UNAVAILABLE' });
    expect(sockets[0].closeCalls).toBeGreaterThanOrEqual(1);
    expect(vi.getTimerCount()).toBe(0);
    await advance(DEFAULT_LAN_FINDER_TIMING.totalMs);
    expect(sockets[0].sent).toHaveLength(sentBefore);
  });

  it('closes a socket that finishes opening after the search already ended', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const { finder, sockets } = createHarness([wifi, ethernet], {}, (socket, index) => {
      if (index === 1) socket.bindGate = gate;
    });

    const result = finder.findRoom('OTB-ABC234');
    await advance(0);
    finder.cancel();
    await result;
    release();
    await advance(0);

    expect(sockets[1].closeCalls).toBeGreaterThanOrEqual(1);
    expect(sockets[1].sent).toEqual([]);
  });

  it('ends within three seconds when a socket never finishes binding', async () => {
    const never = new Promise<void>(() => undefined);
    const { finder } = createHarness([wifi], {}, socket => { socket.bindGate = never; });
    const startedAt = Date.now();

    const result = finder.findRoom('OTB-ABC234');
    await advance(DEFAULT_LAN_FINDER_TIMING.totalMs);

    await expect(result).resolves.toEqual({ ok: false, code: 'UNAVAILABLE' });
    expect(Date.now() - startedAt).toBe(DEFAULT_LAN_FINDER_TIMING.totalMs);
  });

  it('honours an injected timing and discovery port', async () => {
    const { finder, sockets } = createHarness([wifi], {
      discoveryPort: 51_000,
      targetsFor: () => ['192.168.1.200'],
      timing: { sendOffsetsMs: [0], listenWindowMs: 50, totalMs: 100 },
    });

    const result = finder.findRoom('OTB-ABC234');
    await advance(100);

    await expect(result).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(sockets[0].sent.map(item => [item.address, item.port])).toEqual([['192.168.1.200', 51_000]]);
  });
});

describe('room-here reply parsing', () => {
  it('accepts exactly the five contract fields', () => {
    expect(parseRoomHereReply(Buffer.from(JSON.stringify(reply())), NONCE)).toBe(53_120);
    expect(parseRoomHereReply(Buffer.from(JSON.stringify(reply({ port: 1 }))), NONCE)).toBe(1);
    expect(parseRoomHereReply(Buffer.from(JSON.stringify(reply({ port: 65_535 }))), NONCE)).toBe(65_535);
  });

  it.each([
    ['another nonce', reply({ nonce: 'x'.repeat(16) })],
    ['an extra field', { ...reply(), name: 'Minh' }],
    ['a missing field', { app: 'own-the-block', type: 'room-here', v: 1, nonce: NONCE }],
    ['a request instead of a reply', { app: 'own-the-block', type: 'find-room', v: 1, nonce: NONCE, port: 1 }],
  ])('rejects %s', (_name, payload) => {
    expect(parseRoomHereReply(Buffer.from(JSON.stringify(payload)), NONCE)).toBeUndefined();
  });

  it('rejects an empty datagram', () => {
    expect(parseRoomHereReply(Buffer.alloc(0), NONCE)).toBeUndefined();
  });
});
