import type { AddressInfo } from 'node:net';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createServer,
  DEVELOPMENT_RENDERER_ORIGIN,
  isDesktopBrowserOrigin,
  isDesktopRequestOriginAllowed,
  PACKAGED_RENDERER_ORIGIN,
  resolveCorsOrigin,
} from './createServer.js';
import { InMemoryPersistenceStore } from './persistence/inMemory.js';
import type { RoomSnapshot } from './rooms.js';
import { createAppRuntime } from './services/runtime.js';

const servers: Array<ReturnType<typeof createServer>['server']> = [];
const temporaryDirectories: string[] = [];
const timing = {
  reconnectGraceMs: 60_000,
  paymentShortfallActionTimeoutMs: 120_000,
  cardAwaitingDrawTimeoutMs: 20_000,
  cardRevealedTimeoutMs: 30_000,
  emergencyRescueTimeoutMs: 30_000,
  pendingSessionTtlMs: 300_000,
  terminalSessionRetentionMs: 604_800_000,
  lobbyRetentionMs: 86_400_000,
  inProgressRetentionMs: 2_592_000_000,
  finishedRetentionMs: 604_800_000,
};

function createTestRuntime() {
  return createAppRuntime(new InMemoryPersistenceStore<RoomSnapshot>(), timing);
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
  await Promise.all(temporaryDirectories.splice(0).map(directory => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe('HTTP health endpoints', () => {
  it('separates liveness from store readiness and shutdown state', async () => {
    const runtime = createTestRuntime();
    const { server } = createServer(runtime);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const health = await fetch(`${baseUrl}/healthz`);
    const ready = await fetch(`${baseUrl}/readyz`);
    expect([health.status, await health.text()]).toEqual([200, 'ok']);
    expect([ready.status, await ready.text()]).toEqual([200, 'ready']);

    vi.spyOn(runtime.persistence, 'healthcheck').mockRejectedValueOnce(
      new Error('store unavailable'),
    );
    const storeUnavailable = await fetch(`${baseUrl}/readyz`);
    expect([storeUnavailable.status, await storeUnavailable.text()]).toEqual([
      503,
      'server unavailable',
    ]);

    runtime.flags.shuttingDown = true;
    const shuttingDown = await fetch(`${baseUrl}/readyz`);
    expect([shuttingDown.status, await shuttingDown.text()]).toEqual([
      503,
      'shutting down',
    ]);
  });

  it('exposes a registry proof only after the reserved room has an actual host', async () => {
    const runtime = createTestRuntime();
    const findRoom = vi.spyOn(runtime.persistence.rooms, 'findByCode');
    const { server } = createServer(runtime, { environment: {
      SERVER_RUNTIME_PROFILE: 'desktop', OTB_REGISTRY_ROOM_CODE: 'OTB-ABC234',
      OTB_REGISTRY_PROOF: 'reserved-proof',
    }, clientDist: path.resolve('src') });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect((await fetch(`${base}/_otb/registry-proof`)).status).toBe(404);
    findRoom.mockResolvedValueOnce({ code: 'OTB-ABC234', hostPlayerId: 'host' } as never);
    const response = await fetch(`${base}/_otb/registry-proof`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ roomCode: 'OTB-ABC234', proof: 'reserved-proof' });
  });
});

describe('resolveCorsOrigin', () => {
  it('uses the exact IPv4 renderer origin by default in development', () => {
    expect(resolveCorsOrigin({ NODE_ENV: 'development' })).toBe(
      DEVELOPMENT_RENDERER_ORIGIN,
    );
    expect(DEVELOPMENT_RENDERER_ORIGIN).toBe('http://127.0.0.1:5173');
  });

  it('keeps an explicit CORS_ORIGIN override in development and production', () => {
    const explicitOrigin = 'https://example.test';

    expect(
      resolveCorsOrigin({ NODE_ENV: 'development', CORS_ORIGIN: explicitOrigin }),
    ).toBe(explicitOrigin);
    expect(
      resolveCorsOrigin({ NODE_ENV: 'production', CORS_ORIGIN: explicitOrigin }),
    ).toBe(explicitOrigin);
  });

  it('uses the development origin for standalone startup', () => {
    expect(resolveCorsOrigin({ NODE_ENV: 'production' })).toBe(DEVELOPMENT_RENDERER_ORIGIN);
  });

  it('accepts only exact HTTP IPv4 browser origins for a desktop host', () => {
    expect(isDesktopBrowserOrigin('http://192.168.1.20:53120')).toBe(true);
    expect(isDesktopBrowserOrigin('http://127.0.0.1:53120')).toBe(true);
    expect(isDesktopBrowserOrigin('https://192.168.1.20:53120')).toBe(false);
    expect(isDesktopBrowserOrigin('http://example.test:53120')).toBe(false);
    expect(isDesktopBrowserOrigin('http://192.168.1.20:53120/path')).toBe(false);
    expect(isDesktopRequestOriginAllowed(undefined, undefined)).toBe(true);
    expect(isDesktopRequestOriginAllowed(PACKAGED_RENDERER_ORIGIN, undefined)).toBe(true);
    expect(isDesktopRequestOriginAllowed(
      'http://192.168.1.20:53120',
      '192.168.1.20:53120',
    )).toBe(true);
    expect(isDesktopRequestOriginAllowed(
      'http://192.168.1.21:53120',
      '192.168.1.20:53120',
    )).toBe(false);
  });

  it('accepts only a matching Quick Tunnel HTTPS origin for a desktop socket', () => {
    expect(isDesktopRequestOriginAllowed('https://room.trycloudflare.com', 'room.trycloudflare.com')).toBe(true);
    expect(isDesktopRequestOriginAllowed('https://room.trycloudflare.com', '127.0.0.1:53120', '127.0.0.1')).toBe(true);
    expect(isDesktopRequestOriginAllowed('https://room.trycloudflare.com', '127.0.0.1:53120', '::ffff:127.0.0.1')).toBe(true);
    expect(isDesktopRequestOriginAllowed('https://room.trycloudflare.com', '127.0.0.1:53120', '192.168.1.20')).toBe(false);
    expect(isDesktopRequestOriginAllowed('http://192.168.1.20:53120', '127.0.0.1:53120', '127.0.0.1')).toBe(false);
    expect(isDesktopRequestOriginAllowed('https://room.trycloudflare.com', 'other.trycloudflare.com')).toBe(false);
    expect(isDesktopRequestOriginAllowed('https://room.trycloudflare.com.evil.test', 'room.trycloudflare.com.evil.test')).toBe(false);
    expect(isDesktopRequestOriginAllowed('http://room.trycloudflare.com', 'room.trycloudflare.com')).toBe(false);
  });
});

describe('runtime profile HTTP policy', () => {
  it('serves only the explicit desktop client root and accepts packaged plus same-origin clients', async () => {
    const clientDist = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-client-'));
    temporaryDirectories.push(clientDist);
    await mkdir(path.join(clientDist, 'assets'));
    await writeFile(path.join(clientDist, 'index.html'), '<main>desktop client</main>');
    await writeFile(path.join(clientDist, 'assets', 'app.js'), 'window.desktopClient = true;');
    const runtime = createTestRuntime();
    const { app, server } = createServer(runtime, {
      environment: {
        NODE_ENV: 'production',
        SERVER_RUNTIME_PROFILE: 'desktop',
      },
      clientDist,
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${String(port)}`;

    expect(app.get('trust proxy')).toBe(false);
    await expect((await fetch(`${origin}/healthz`)).text()).resolves.toBe('ok');
    await expect((await fetch(`${origin}/readyz`)).text()).resolves.toBe('ready');
    await expect((await fetch(`${origin}/assets/app.js`)).text()).resolves.toContain('desktopClient');
    await expect((await fetch(`${origin}/room/OTB-ABC123`)).text()).resolves.toContain('desktop client');
    await expect((await fetch(`${origin}/package.json`)).text()).resolves.toContain('desktop client');

    const handshake = `${origin}/socket.io/?EIO=4&transport=polling`;
    const sameOrigin = await fetch(handshake, { headers: { Origin: origin } });
    expect(sameOrigin.status).toBe(200);
    expect(sameOrigin.headers.get('access-control-allow-origin')).toBe(origin);
    const packaged = await fetch(handshake, { headers: { Origin: PACKAGED_RENDERER_ORIGIN } });
    expect(packaged.headers.get('access-control-allow-origin')).toBe(PACKAGED_RENDERER_ORIGIN);
    const unrelated = await fetch(handshake, { headers: { Origin: 'https://unrelated.example' } });
    expect(unrelated.status).toBe(403);
    expect(unrelated.headers.get('access-control-allow-origin')).toBeNull();
    const differentIpv4Origin = await fetch(handshake, {
      headers: { Origin: `http://192.168.1.20:${String(port)}` },
    });
    expect(differentIpv4Origin.status).toBe(403);
  });

  it('does not serve static files or trust proxy headers in standalone development mode', async () => {
    const clientDist = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-profiles-'));
    temporaryDirectories.push(clientDist);
    await writeFile(path.join(clientDist, 'index.html'), 'profile client');
    const developmentRuntime = createTestRuntime();
    const development = createServer(developmentRuntime, {
      environment: { NODE_ENV: 'development', SERVER_RUNTIME_PROFILE: 'development' },
      clientDist,
    });
    servers.push(development.server);
    expect(development.app.get('trust proxy')).toBe(false);
    await new Promise<void>(resolve => development.server.listen(0, '127.0.0.1', resolve));
    const { port } = development.server.address() as AddressInfo;
    expect((await fetch(`http://127.0.0.1:${String(port)}/index.html`)).status).toBe(404);
  });
});

describe('HTTP client identity behind the tunnel of an Online Host', () => {
  async function startDesktopServer(environment: NodeJS.ProcessEnv): Promise<string> {
    const clientDist = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-identity-'));
    temporaryDirectories.push(clientDist);
    await writeFile(path.join(clientDist, 'index.html'), '<main>client</main>');
    const { server } = createServer(createTestRuntime(), {
      environment: { NODE_ENV: 'production', SERVER_RUNTIME_PROFILE: 'desktop', ...environment },
      clientDist,
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  }

  const probe = async (origin: string, headers: Record<string, string>, count: number): Promise<number[]> => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < count; attempt += 1) {
      statuses.push((await fetch(`${origin}/_otb/room?code=ROOM-1`, { headers })).status);
    }
    return statuses;
  };

  it('gives every tunnel visitor their own room-probe allowance', async () => {
    const origin = await startDesktopServer({ OTB_ONLINE_ROOM_CODE: 'ROOM-1' });
    const visitorA = { 'CF-Connecting-IP': '198.51.100.1' };
    expect(new Set(await probe(origin, visitorA, 60))).toEqual(new Set([404]));
    expect(await probe(origin, visitorA, 1)).toEqual([429]);
    // A different visitor behind the same local connector is not affected by visitor A.
    expect(await probe(origin, { 'CF-Connecting-IP': '198.51.100.2' }, 1)).toEqual([404]);
    // The Host's own header-less probes use the shared local allowance.
    expect(await probe(origin, {}, 1)).toEqual([404]);
  });

  it('does not let a forged visitor header buy more allowance when no tunnel feeds the server', async () => {
    const origin = await startDesktopServer({});
    expect(new Set(await probe(origin, { 'CF-Connecting-IP': '198.51.100.1' }, 60))).toEqual(new Set([404]));
    expect(await probe(origin, { 'CF-Connecting-IP': '198.51.100.2' }, 1)).toEqual([429]);
    expect(await probe(origin, { 'X-Forwarded-For': '198.51.100.3', 'True-Client-IP': '198.51.100.4' }, 1)).toEqual([429]);
  });

  it('keeps Express from trusting forwarding headers on its own', async () => {
    const clientDist = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-proxy-'));
    temporaryDirectories.push(clientDist);
    await writeFile(path.join(clientDist, 'index.html'), '<main>client</main>');
    const { app, server } = createServer(createTestRuntime(), {
      environment: { NODE_ENV: 'production', SERVER_RUNTIME_PROFILE: 'desktop', OTB_ONLINE_ROOM_CODE: 'ROOM-1' },
      clientDist,
    });
    servers.push(server);
    expect(app.get('trust proxy')).toBe(false);
  });
});
