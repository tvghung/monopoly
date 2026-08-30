import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  LAN_DISCOVERY_TTL_MS,
  LAN_DISCOVERY_VERSION,
  LAN_DISCOVERY_PORT,
  LANDiscoveryController,
  parseAdvertisement,
  serializeAdvertisement,
  type DiscoveryAdvertisement,
} from '../src/lanDiscovery';

interface FakeSocketOptions {
  bindError?: Error;
  broadcastError?: Error;
  bindGate?: Promise<void>;
}

class FakeSocket extends EventEmitter {
  readonly sent: Array<{ payload: Buffer; address: string; port: number }> = [];
  readonly events: string[] = [];
  readonly bindCalls: Array<{ port: number; address: string }> = [];
  broadcast = false;
  bound = false;
  closed = false;

  public constructor(private readonly options: FakeSocketOptions = {}) {
    super();
  }

  bind(port: number, address: string, callback: () => void): this {
    this.events.push('bind');
    this.bindCalls.push({ port, address });
    const complete = () => {
      if (this.options.bindError) {
        this.emit('error', this.options.bindError);
        return;
      }
      this.bound = true;
      callback();
    };
    if (this.options.bindGate) void this.options.bindGate.then(complete);
    else queueMicrotask(complete);
    return this;
  }

  send(payload: Buffer, port: number, address: string, callback?: (error: Error | null) => void): void {
    this.events.push('send');
    this.sent.push({ payload, address, port });
    callback?.(null);
  }

  setBroadcast(value: boolean): void {
    this.events.push('setBroadcast');
    if (!this.bound) throw new Error('EBADF: socket is not bound');
    if (this.options.broadcastError) throw this.options.broadcastError;
    this.broadcast = value;
  }

  close(callback?: () => void): this {
    this.events.push('close');
    this.closed = true;
    callback?.();
    return this;
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}

const interfaces = [
  {
    name: 'Wi-Fi',
    displayName: 'Wi-Fi',
    address: '192.168.1.15',
    netmask: '255.255.255.0',
    broadcast: '192.168.1.255',
    preference: 'preferred' as const,
    rank: 0,
  },
];

afterEach(() => {
  vi.useRealTimers();
});

function advertisement(overrides: Partial<DiscoveryAdvertisement> = {}): DiscoveryAdvertisement {
  return {
    type: 'own-the-block-lan',
    version: LAN_DISCOVERY_VERSION,
    instanceId: '00000000-0000-4000-8000-000000000001',
    appVersion: '3.0.0',
    protocolVersion: 8,
    roomCode: 'LAN-1234',
    port: 8080,
    endpoints: ['http://192.168.1.15:8080'],
    expiresInMs: LAN_DISCOVERY_TTL_MS,
    ...overrides,
  };
}

describe('LAN discovery protocol', () => {
  it('accepts safe advertisements and rejects malformed or public endpoints', () => {
    const valid = parseAdvertisement(serializeAdvertisement(advertisement()), 100);
    expect(valid).toMatchObject({ gameId: advertisement().instanceId, roomCode: 'LAN-1234' });
    expect(parseAdvertisement('{not-json')).toBeUndefined();
    expect(parseAdvertisement(serializeAdvertisement(advertisement({
      endpoints: ['https://192.168.1.15:8080'],
    })))).toBeUndefined();
    expect(parseAdvertisement(serializeAdvertisement(advertisement({
      endpoints: ['http://8.8.8.8:8080'],
    })))).toBeUndefined();
    expect(parseAdvertisement(serializeAdvertisement(advertisement({
      endpoints: ['http://user:secret@192.168.1.15:8080'],
    })))).toBeUndefined();
  });

  it('deduplicates hosts, expires them, and stops browsing cleanly', async () => {
    const socket = new FakeSocket();
    let now = 1_000;
    const controller = new LANDiscoveryController({
      appVersion: '3.0.0',
      socketFactory: () => socket,
      now: () => now,
      interfaceProvider: () => interfaces,
      discoveryPort: LAN_DISCOVERY_PORT,
    });

    await controller.startBrowsing();
    const payload = serializeAdvertisement(advertisement());
    socket.emit('message', payload, { address: '192.168.1.15' });
    socket.emit('message', payload, { address: '192.168.1.15' });
    expect(controller.getGames()).toHaveLength(1);
    now += LAN_DISCOVERY_TTL_MS + 1;
    expect(controller.getGames()).toEqual([]);
    await controller.stopBrowsing();
    expect(controller.status.browsing).toBe(false);
  });

  it('advertises only onboarding metadata to interface broadcast addresses', async () => {
    const socket = new FakeSocket();
    const controller = new LANDiscoveryController({
      appVersion: '3.0.0',
      socketFactory: () => socket,
      interfaceProvider: () => interfaces,
    });

    await controller.startAdvertising({ roomCode: 'LAN-1234', port: 8080 });
    expect(socket.bindCalls).toEqual([{ port: 0, address: '0.0.0.0' }]);
    expect(socket.events.slice(0, 3)).toEqual(['bind', 'setBroadcast', 'send']);
    expect(socket.broadcast).toBe(true);
    expect(socket.sent.length).toBeGreaterThan(0);
    expect(controller.status.advertising).toBe(true);
    const body = JSON.parse(socket.sent[0]?.payload.toString('utf8') ?? '{}') as Record<string, unknown>;
    expect(body).toMatchObject({ type: 'own-the-block-lan', roomCode: 'LAN-1234', port: 8080 });
    expect(JSON.stringify(body)).not.toMatch(/postgres|password|token|credential/iu);
    await controller.stopAdvertising();
    expect(controller.status.advertising).toBe(false);
    expect(socket.closed).toBe(true);
  });

  it('rolls back completely when advertiser bind fails', async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket({ bindError: new Error('bind failed') });
    const controller = new LANDiscoveryController({
      appVersion: '3.0.0',
      socketFactory: () => socket,
      interfaceProvider: () => interfaces,
    });

    await expect(controller.startAdvertising({ roomCode: 'LAN-1234', port: 8080 }))
      .rejects.toThrow('bind failed');
    expect(controller.status.advertising).toBe(false);
    expect(socket.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rolls back completely when enabling broadcast fails', async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket({ broadcastError: new Error('broadcast failed') });
    const controller = new LANDiscoveryController({
      appVersion: '3.0.0',
      socketFactory: () => socket,
      interfaceProvider: () => interfaces,
    });

    await expect(controller.startAdvertising({ roomCode: 'LAN-1234', port: 8080 }))
      .rejects.toThrow('broadcast failed');
    expect(controller.status.advertising).toBe(false);
    expect(socket.sent).toHaveLength(0);
    expect(socket.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('coalesces concurrent advertiser starts into one socket and interval', async () => {
    vi.useFakeTimers();
    const bind = deferred<void>();
    const socket = new FakeSocket({ bindGate: bind.promise });
    const sockets: FakeSocket[] = [];
    const controller = new LANDiscoveryController({
      appVersion: '3.0.0',
      socketFactory: () => {
        sockets.push(socket);
        return socket;
      },
      interfaceProvider: () => interfaces,
    });

    const first = controller.startAdvertising({ roomCode: 'LAN-1234', port: 8080 });
    const second = controller.startAdvertising({ roomCode: 'LAN-5678', port: 8081 });
    expect(sockets).toHaveLength(1);
    bind.resolve();
    await Promise.all([first, second]);

    expect(sockets).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
    expect(controller.status.advertising).toBe(true);
    expect(JSON.parse(socket.sent.at(-1)?.payload.toString('utf8') ?? '{}')).toMatchObject({
      roomCode: 'LAN-5678',
      port: 8081,
    });
    await controller.stopAdvertising();
  });

  it('stops and cleans up when advertiser startup is pending', async () => {
    vi.useFakeTimers();
    const bind = deferred<void>();
    const socket = new FakeSocket({ bindGate: bind.promise });
    const controller = new LANDiscoveryController({
      appVersion: '3.0.0',
      socketFactory: () => socket,
      interfaceProvider: () => interfaces,
    });

    const start = controller.startAdvertising({ roomCode: 'LAN-1234', port: 8080 });
    const stop = controller.stopAdvertising();
    bind.resolve();
    await Promise.all([start, stop]);

    expect(controller.status.advertising).toBe(false);
    expect(socket.sent).toHaveLength(0);
    expect(socket.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops and cleans up when browsing startup is pending', async () => {
    vi.useFakeTimers();
    const bind = deferred<void>();
    const socket = new FakeSocket({ bindGate: bind.promise });
    const controller = new LANDiscoveryController({
      appVersion: '3.0.0',
      socketFactory: () => socket,
      interfaceProvider: () => interfaces,
    });

    const start = controller.startBrowsing();
    const stop = controller.stopBrowsing();
    bind.resolve();
    await Promise.all([start, stop]);

    expect(controller.status.browsing).toBe(false);
    expect(socket.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps repeated stop and dispose calls idempotent', async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const controller = new LANDiscoveryController({
      appVersion: '3.0.0',
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      interfaceProvider: () => interfaces,
    });

    await Promise.all([controller.startBrowsing(), controller.startAdvertising({ roomCode: 'LAN-1234', port: 8080 })]);
    await Promise.all([
      controller.stopBrowsing(),
      controller.stopBrowsing(),
      controller.stopAdvertising(),
      controller.stopAdvertising(),
      controller.dispose(),
      controller.dispose(),
    ]);

    expect(controller.status).toMatchObject({ browsing: false, advertising: false, games: [] });
    expect(sockets.every(socket => socket.closed)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('proves the real Node dgram bind-before-broadcast lifecycle', async () => {
    const socket = dgram.createSocket('udp4');
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const handleError = (error: Error): void => {
        if (settled) return;
        settled = true;
        socket.off('error', handleError);
        try {
          socket.close(() => undefined);
        } catch {
          // The test is already rejecting with the socket error.
        }
        reject(error);
      };
      socket.once('error', handleError);
      socket.bind(0, '0.0.0.0', () => {
        try {
          socket.setBroadcast(true);
          socket.off('error', handleError);
          settled = true;
          socket.close(() => resolve());
        } catch (error) {
          handleError(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  });
});
