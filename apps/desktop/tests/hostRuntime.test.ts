import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  HostRuntimeController,
  type ManagedPostgresLike,
  type ServerHelperLike,
} from '../src/hostRuntime';
import type { ManagedPostgresInfo, ManagedPostgresState } from '../src/managedPostgres';
import type { ServerHelperInfo, ServerHelperState } from '../src/serverHelper';

class FakePostgres implements ManagedPostgresLike {
  state: ManagedPostgresState = 'STOPPED';
  starts = 0;
  stops = 0;

  async start(): Promise<ManagedPostgresInfo> {
    this.starts += 1;
    this.state = 'READY';
    return {
      dataDirectory: path.resolve('data'),
      resourceRoot: path.resolve('postgres'),
      port: 43122,
      databaseUrl: 'postgresql://postgres@127.0.0.1:43122/own_the_block',
      pid: 7318,
    };
  }

  async stop(): Promise<void> {
    this.stops += 1;
    this.state = 'STOPPED';
  }
}

class FakeHelper implements ServerHelperLike {
  state: ServerHelperState = 'STOPPED';
  starts = 0;
  stops = 0;
  readonly diagnostic = '';

  async start(): Promise<ServerHelperInfo> {
    this.starts += 1;
    this.state = 'READY';
    return { host: '0.0.0.0', port: 43_123, pid: 7319 };
  }

  async stop(): Promise<void> {
    this.stops += 1;
    this.state = 'STOPPED';
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

function options(overrides: Partial<ConstructorParameters<typeof HostRuntimeController>[0]> = {}) {
  return {
    resourceRoot: path.resolve('generated/postgres/win32-x64'),
    helperPath: path.resolve('generated/server-helper/server-helper.cjs'),
    migrationDirectory: path.resolve('generated/server-helper/migrations'),
    userDataPath: path.resolve('user-data'),
    appVersion: '3.0.0',
    defaultPort: 43_123,
    interfaceProvider: () => interfaces,
    ...overrides,
  };
}

describe('host runtime controller', () => {
  it('composes one PostgreSQL/helper start and shuts them down in authority order', async () => {
    const postgres = new FakePostgres();
    const helper = new FakeHelper();
    const events: string[] = [];
    const controller = new HostRuntimeController(options({
      postgres,
      helperFactory: () => helper,
      stopAdvertisement: () => { events.push('advertisement'); },
    }));

    const [first, second] = await Promise.all([controller.start(), controller.start()]);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      state: 'READY',
      gamePort: 43_123,
      localEndpoint: 'http://127.0.0.1:43123',
      lanAvailable: true,
      advertisedEndpoints: ['http://192.168.1.15:43123'],
    });
    expect(postgres.starts).toBe(1);
    expect(helper.starts).toBe(1);

    controller.setHosting(true);
    expect(controller.status.state).toBe('HOSTING');
    await Promise.all([controller.stop(), controller.stop()]);
    expect(events).toEqual(['advertisement']);
    expect(helper.stops).toBe(1);
    expect(postgres.stops).toBe(1);
    expect(controller.status.state).toBe('IDLE');
  });

  it('reports a safe timeout failure and cleans up the managed database', async () => {
    const postgres = new FakePostgres();
    const helper: ServerHelperLike = {
      state: 'STOPPED',
      diagnostic: 'server readiness timed out',
      start: vi.fn(async () => {
        throw new Error('server readiness timed out');
      }),
      stop: vi.fn(async () => undefined),
    };
    const controller = new HostRuntimeController(options({
      postgres,
      helperFactory: () => helper,
    }));

    await expect(controller.start()).rejects.toThrow('server readiness timed out');
    expect(controller.status).toMatchObject({
      state: 'FAILED',
      errorCode: 'READINESS_TIMEOUT',
    });
    expect(controller.status.diagnostic).not.toContain('postgresql://postgres@');
    expect(postgres.stops).toBe(1);
    expect(helper.stop).toHaveBeenCalledOnce();
  });
});
