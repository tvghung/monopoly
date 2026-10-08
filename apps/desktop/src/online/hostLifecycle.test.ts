import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HostRuntimeController } from '../hostRuntime';

afterEach(() => vi.unstubAllGlobals());

describe('Online host lifecycle', () => {
  it('starts the local authority, waits for a real room before advertising, and revokes on close', async () => {
    const fixtureRoot = path.join(os.tmpdir(), 'otb-host-lifecycle');
    let postgresState: 'STOPPED' | 'READY' = 'STOPPED';
    const postgres = {
      get state() { return postgresState; },
      start: vi.fn(() => {
        postgresState = 'READY';
        return Promise.resolve({ databaseUrl: 'postgres://local/otb', dataDirectory: path.join(fixtureRoot, 'data'),
          resourceRoot: path.join(fixtureRoot, 'postgres'), port: 5432, pid: 2 });
      }),
      stop: vi.fn(() => { postgresState = 'STOPPED'; return Promise.resolve(); }),
    };
    const helper = {
      state: 'STOPPED' as const,
      diagnostic: '',
      start: vi.fn(() => Promise.resolve({ host: '0.0.0.0', port: 53120, pid: 1 })),
      stop: vi.fn(() => Promise.resolve()),
    };
    const connectivity = {
      start: vi.fn(() => Promise.resolve('https://room.trycloudflare.com')),
      stop: vi.fn(() => Promise.resolve()),
    };
    const discovery = {
      reserve: vi.fn(() => Promise.resolve({ credential: 'a'.repeat(43), proof: '12345678-1234-1234-1234-123456789012' })),
      activate: vi.fn(() => Promise.resolve()),
      renew: vi.fn(() => Promise.resolve()),
      suspend: vi.fn(() => Promise.resolve()),
      revoke: vi.fn(() => Promise.resolve()),
      resolve: vi.fn(() => Promise.resolve(null)),
    };
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('ready'))));
    const host = new HostRuntimeController({
      resourceRoot: path.join(fixtureRoot, 'postgres'), helperPath: path.join(fixtureRoot, 'helper.cjs'),
      migrationDirectory: path.join(fixtureRoot, 'migrations'), clientDist: path.join(fixtureRoot, 'dist'),
      userDataPath: path.join(fixtureRoot, 'data'), appVersion: '1.4.1',
      interfaceProvider: () => [{ name: 'Wi-Fi', displayName: 'Wi-Fi', address: '192.168.1.15',
        netmask: '255.255.255.0', preference: 'preferred', rank: 0 }],
      postgres, helperFactory: () => helper, connectivity, discovery,
    });
    try {
      const status = await host.start({ mode: 'ONLINE', roomCode: 'OTB-ABC234' });
      expect(status.localEndpoint).toBe('http://127.0.0.1:53120');
      expect(status.onlineEndpoint).toBe('https://room.trycloudflare.com');
      expect(status.onlineState).toBe('AWAITING_ROOM');
      expect(discovery.activate).not.toHaveBeenCalled();
      expect((await host.activateOnlineRoom('OTB-ABC234')).onlineState).toBe('READY');
      expect(discovery.activate).toHaveBeenCalledWith('OTB-ABC234', 'a'.repeat(43), 'https://room.trycloudflare.com');
    } finally {
      await host.stop();
    }
    expect(discovery.revoke).toHaveBeenCalledOnce();
    expect(connectivity.stop).toHaveBeenCalledOnce();
    expect(helper.stop).toHaveBeenCalledOnce();
    expect(postgres.stop).toHaveBeenCalledOnce();
  });
});
