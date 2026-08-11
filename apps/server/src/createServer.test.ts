import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createServer } from './createServer.js';
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
