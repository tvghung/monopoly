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
  it('separates liveness from database-backed readiness and shutdown state', async () => {
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
      new Error('database offline'),
    );
    const databaseOffline = await fetch(`${baseUrl}/readyz`);
    expect([databaseOffline.status, await databaseOffline.text()]).toEqual([
      503,
      'database unavailable',
    ]);

    runtime.flags.shuttingDown = true;
    const shuttingDown = await fetch(`${baseUrl}/readyz`);
    expect([shuttingDown.status, await shuttingDown.text()]).toEqual([
      503,
      'shutting down',
    ]);
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

  it('allows the explicit packaged Electron origin in production by default', () => {
    expect(resolveCorsOrigin({ NODE_ENV: 'production' })).toBe(PACKAGED_RENDERER_ORIGIN);
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

  it('keeps cloud proxy/static behavior and development no-static behavior separate', async () => {
    const clientDist = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-profiles-'));
    temporaryDirectories.push(clientDist);
    await writeFile(path.join(clientDist, 'index.html'), 'profile client');
    const cloudRuntime = createTestRuntime();
    const cloud = createServer(cloudRuntime, {
      environment: { NODE_ENV: 'production', SERVER_RUNTIME_PROFILE: 'cloud' },
      clientDist,
    });
    servers.push(cloud.server);
    expect(cloud.app.get('trust proxy')).toBe(1);

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

describe('Socket.IO CORS handshake', () => {
  it('authorizes the packaged browser origin without claiming WebSocket-client rejection', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousCorsOrigin = process.env.CORS_ORIGIN;
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGIN;

    try {
      const runtime = createAppRuntime(
        new InMemoryPersistenceStore<RoomSnapshot>(),
        {
          reconnectGraceMs: 60_000,
          paymentShortfallActionTimeoutMs: 120_000,
          cardAwaitingDrawTimeoutMs: 20_000,
          cardRevealedTimeoutMs: 30_000,
          pendingSessionTtlMs: 300_000,
          terminalSessionRetentionMs: 604_800_000,
          lobbyRetentionMs: 86_400_000,
          inProgressRetentionMs: 2_592_000_000,
          finishedRetentionMs: 604_800_000,
        },
      );
      const { server } = createServer(runtime);
      servers.push(server);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as AddressInfo;
      const handshakeUrl = `http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling`;

      const sameOrigin = await fetch(handshakeUrl);
      expect(sameOrigin.status).toBe(200);

      const packaged = await fetch(handshakeUrl, {
        headers: { Origin: PACKAGED_RENDERER_ORIGIN },
      });
      expect(packaged.status).toBe(200);
      expect(packaged.headers.get('access-control-allow-origin')).toBe(
        PACKAGED_RENDERER_ORIGIN,
      );

      const disallowed = await fetch(handshakeUrl, {
        headers: { Origin: 'https://not-allowed.example' },
      });
      // The HTTP endpoint can still be reached by a non-browser client. Browser
      // CORS authorization is not server-side WebSocket authentication.
      expect(disallowed.status).toBe(200);
      expect(disallowed.headers.get('access-control-allow-origin')).not.toBe(
        'https://not-allowed.example',
      );
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousCorsOrigin === undefined) delete process.env.CORS_ORIGIN;
      else process.env.CORS_ORIGIN = previousCorsOrigin;
    }
  });
});
