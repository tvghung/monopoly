import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createServer,
  DEVELOPMENT_RENDERER_ORIGIN,
  PACKAGED_RENDERER_ORIGIN,
  resolveCorsOrigin,
} from './createServer.js';
import { InMemoryPersistenceStore } from './persistence/inMemory.js';
import type { RoomSnapshot } from './rooms.js';
import { createAppRuntime } from './services/runtime.js';

const servers: Array<ReturnType<typeof createServer>['server']> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

describe('HTTP health endpoints', () => {
  it('separates liveness from database-backed readiness and shutdown state', async () => {
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
});

describe('Socket.IO CORS handshake', () => {
  it('allows the packaged origin, keeps same-origin requests working, and rejects other origins', async () => {
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
      // Socket.IO returns the configured allowlist value; the browser rejects
      // this response because it does not match the requesting origin.
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
