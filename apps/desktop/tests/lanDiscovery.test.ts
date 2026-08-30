import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import {
  LAN_DISCOVERY_TTL_MS,
  LAN_DISCOVERY_VERSION,
  LAN_DISCOVERY_PORT,
  LANDiscoveryController,
  parseAdvertisement,
  serializeAdvertisement,
  type DiscoveryAdvertisement,
} from '../src/lanDiscovery';

class FakeSocket extends EventEmitter {
  readonly sent: Array<{ payload: Buffer; address: string; port: number }> = [];
  broadcast = false;

  bind(_port: number, _address: string, callback: () => void): this {
    queueMicrotask(callback);
    return this;
  }

  send(payload: Buffer, port: number, address: string, callback?: (error: Error | null) => void): void {
    this.sent.push({ payload, address, port });
    callback?.(null);
  }

  setBroadcast(value: boolean): void {
    this.broadcast = value;
  }

  close(callback?: () => void): this {
    callback?.();
    return this;
  }
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
    expect(socket.broadcast).toBe(true);
    expect(socket.sent.length).toBeGreaterThan(0);
    const body = JSON.parse(socket.sent[0]?.payload.toString('utf8') ?? '{}') as Record<string, unknown>;
    expect(body).toMatchObject({ type: 'own-the-block-lan', roomCode: 'LAN-1234', port: 8080 });
    expect(JSON.stringify(body)).not.toMatch(/postgres|password|token|credential/iu);
    await controller.stopAdvertising();
    expect(controller.status.advertising).toBe(false);
  });
});
