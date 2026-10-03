import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  HostRuntimeController,
  type ManagedPostgresLike,
  type ServerHelperLike,
} from '../src/hostRuntime';
import type { ManagedPostgresInfo, ManagedPostgresState } from '../src/managedPostgres';
import { resolveNetworkInterfaces } from '../src/networkInterfaces';
import type { ServerHelperInfo, ServerHelperState } from '../src/serverHelper';

class FakePostgres implements ManagedPostgresLike {
  state: ManagedPostgresState = 'STOPPED';
  starts = 0;
  stops = 0;

  public constructor(private readonly events: string[] = []) {}

  async start(): Promise<ManagedPostgresInfo> {
    this.starts += 1;
    this.events.push('postgres:start');
    this.state = 'READY';
    return {
      dataDirectory: path.resolve('data'),
      resourceRoot: path.resolve('postgres'),
      port: 43_122,
      databaseUrl: 'postgresql://postgres@127.0.0.1:43122/own_the_block',
      pid: 7_318,
    };
  }

  async stop(): Promise<void> {
    this.stops += 1;
    this.events.push('postgres:stop');
    this.state = 'STOPPED';
  }
}

class FakeHelper implements ServerHelperLike {
  state: ServerHelperState = 'STOPPED';
  starts = 0;
  stops = 0;
  diagnostic = '';
  healthError: Error | undefined;
  startError: Error | undefined;
  private readonly unexpected = new Set<(diagnostic: string) => void>();

  public constructor(
    private readonly port = 43_123,
    private readonly events: string[] = [],
  ) {}

  async start(): Promise<ServerHelperInfo> {
    this.starts += 1;
    this.events.push('helper:start');
    if (this.startError) {
      this.state = 'FAILED';
      throw this.startError;
    }
    this.state = 'READY';
    return { host: '0.0.0.0', port: this.port, pid: 7_319 };
  }

  async stop(): Promise<void> {
    this.stops += 1;
    this.events.push('helper:stop');
    this.state = 'STOPPED';
  }

  async checkHealth(): Promise<void> {
    if (this.healthError) throw this.healthError;
  }

  onUnexpectedExit(listener: (diagnostic: string) => void): () => void {
    this.unexpected.add(listener);
    return () => this.unexpected.delete(listener);
  }

  exitUnexpectedly(diagnostic = 'server helper exited'): void {
    this.state = 'FAILED';
    this.diagnostic = diagnostic;
    for (const listener of this.unexpected) listener(diagnostic);
  }
}

const interfaces = [
  {
    name: 'Wi-Fi',
    displayName: 'Wi-Fi',
    address: '192.168.1.15',
    netmask: '255.255.255.0',
    preference: 'preferred' as const,
    rank: 0,
  },
  {
    name: 'VPN',
    displayName: 'VPN',
    address: '100.64.0.4',
    netmask: '255.192.0.0',
    preference: 'fallback' as const,
    rank: 3,
  },
];

function options(overrides: Partial<ConstructorParameters<typeof HostRuntimeController>[0]> = {}) {
  return {
    resourceRoot: path.resolve('generated/postgres/win32-x64'),
    helperPath: path.resolve('generated/server-helper/server-helper.cjs'),
    migrationDirectory: path.resolve('generated/server-helper/migrations'),
    clientDist: path.resolve('client/dist'),
    userDataPath: path.resolve('user-data'),
    appVersion: '3.0.0',
    defaultPort: 43_123,
    interfaceProvider: () => interfaces,
    healthCheckIntervalMs: 0,
    ...overrides,
  };
}

describe('host runtime controller', () => {
  it('starts once, publishes only safe LAN state, refreshes selection, and stops in authority order', async () => {
    const events: string[] = [];
    const postgres = new FakePostgres(events);
    const helper = new FakeHelper(43_123, events);
    const controller = new HostRuntimeController(options({
      postgres,
      helperFactory: () => helper,
    }));

    expect(controller.status).toMatchObject({ state: 'IDLE', selectedLanUrl: null });
    const [first, second] = await Promise.all([
      controller.start({ preferredAddress: '192.168.1.15' }),
      controller.start({ preferredAddress: '192.168.1.15' }),
    ]);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      state: 'HOSTING',
      gamePort: 43_123,
      localEndpoint: 'http://127.0.0.1:43123',
      lanAvailable: true,
      advertisedEndpoints: [
        'http://192.168.1.15:43123',
        'http://100.64.0.4:43123',
      ],
      selectedLanUrl: 'http://192.168.1.15:43123',
    });
    expect(JSON.stringify(first)).not.toContain('postgresql://');
    expect(postgres.starts).toBe(1);
    expect(helper.starts).toBe(1);

    expect(controller.refreshNetwork('100.64.0.4').selectedLanUrl)
      .toBe('http://100.64.0.4:43123');
    await Promise.all([controller.stop(), controller.stop()]);
    expect(events.slice(-2)).toEqual(['helper:stop', 'postgres:stop']);
    expect(controller.status.state).toBe('IDLE');
  });

  it('reports a safe timeout failure and cleans up the managed database', async () => {
    const postgres = new FakePostgres();
    const helper = new FakeHelper();
    helper.startError = new Error(
      'server readiness timed out postgresql://postgres:secret@127.0.0.1:43122/own_the_block',
    );
    const controller = new HostRuntimeController(options({
      postgres,
      helperFactory: () => helper,
    }));

    await expect(controller.start()).rejects.toThrow('server readiness timed out');
    expect(controller.status).toMatchObject({
      state: 'FAILED',
      errorCode: 'READINESS_TIMEOUT',
    });
    expect(controller.status.diagnostic).not.toContain('secret');
    expect(postgres.stops).toBe(1);
  });

  it('uses a bounded automatic-port retry and publishes the actual listening port', async () => {
    const helpers = [new FakeHelper(), new FakeHelper(), new FakeHelper(53_120)];
    helpers[0]!.startError = new Error('EADDRINUSE');
    helpers[1]!.startError = new Error('address already in use');
    const factory = vi.fn(() => helpers.shift()!);
    const controller = new HostRuntimeController(options({
      postgres: new FakePostgres(),
      defaultPort: 0,
      helperFactory: factory,
    }));

    await expect(controller.start()).resolves.toMatchObject({
      gamePort: 53_120,
      localEndpoint: 'http://127.0.0.1:53120',
      selectedLanUrl: 'http://192.168.1.15:53120',
    });
    expect(factory).toHaveBeenCalledTimes(3);
    await controller.stop();
  });

  it('retains PostgreSQL and performs a bounded helper restart after an unexpected exit', async () => {
    const postgres = new FakePostgres();
    const first = new FakeHelper();
    const recovered = new FakeHelper();
    const factory = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(recovered);
    const controller = new HostRuntimeController(options({ postgres, helperFactory: factory }));
    await controller.start();

    first.exitUnexpectedly();
    await vi.waitFor(() => expect(controller.status.state).toBe('HOSTING'));

    expect(recovered.starts).toBe(1);
    expect(postgres.starts).toBe(1);
    expect(postgres.stops).toBe(0);
    await controller.stop();
  });

  it('restarts the existing database after readiness fails and reaches final FAILED after two bad recoveries', async () => {
    const postgres = new FakePostgres();
    const first = new FakeHelper();
    first.healthError = new Error('database unavailable');
    const failedOne = new FakeHelper();
    failedOne.startError = new Error('server helper failed one');
    const failedTwo = new FakeHelper();
    failedTwo.startError = new Error('server helper failed two');
    const factory = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(failedOne)
      .mockReturnValueOnce(failedTwo);
    const controller = new HostRuntimeController(options({ postgres, helperFactory: factory }));
    await controller.start();

    await controller.verifyAndRecover();

    expect(controller.status).toMatchObject({ state: 'FAILED', errorCode: 'HELPER_FAILED' });
    expect(postgres.starts).toBeGreaterThanOrEqual(2);
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it('fails before starting processes when no usable LAN interface exists', async () => {
    const postgres = new FakePostgres();
    const controller = new HostRuntimeController(options({
      postgres,
      interfaceProvider: () => [],
    }));

    await expect(controller.start()).rejects.toThrow('No usable LAN IPv4');
    expect(controller.status).toMatchObject({
      state: 'FAILED',
      errorCode: 'NO_LAN_INTERFACE',
    });
    expect(postgres.starts).toBe(0);
  });

  describe('automatic network choice', () => {
    const adapters = {
      'Wi-Fi': [{ address: '192.168.1.15', netmask: '255.255.255.0', family: 'IPv4', mac: '', internal: false }],
      Ethernet: [{ address: '10.0.0.8', netmask: '255.255.255.0', family: 'IPv4', mac: '', internal: false }],
    };
    const provider = (defaultRouteAddress?: string) => resolveNetworkInterfaces(() => adapters, defaultRouteAddress);

    it('hosts on the interface that carries the default route without being told which one', async () => {
      const routeProbe = vi.fn(() => Promise.resolve<string | undefined>('10.0.0.8'));
      const controller = new HostRuntimeController(options({
        postgres: new FakePostgres(),
        helperFactory: () => new FakeHelper(),
        interfaceProvider: provider,
        routeProbe,
      }));

      const status = await controller.start();

      expect(routeProbe).toHaveBeenCalledOnce();
      expect(status.selectedLanUrl).toBe('http://10.0.0.8:43123');
      expect(status.interfaces.map(candidate => candidate.address)).toEqual(['10.0.0.8', '192.168.1.15']);
      await controller.stop();
    });

    it('keeps the network it hosts on when the default route moves, but lists the new best one first', async () => {
      let route: string | undefined = '10.0.0.8';
      const controller = new HostRuntimeController(options({
        postgres: new FakePostgres(),
        helperFactory: () => new FakeHelper(),
        interfaceProvider: provider,
        routeProbe: () => Promise.resolve(route),
      }));
      await controller.start();

      route = '192.168.1.15';
      const status = await controller.verifyAndRecover();

      expect(status.selectedLanUrl).toBe('http://10.0.0.8:43123');
      expect(status.interfaces[0]?.address).toBe('192.168.1.15');
      await controller.stop();
    });

    it('falls back to the rank order when the route probe fails or finds nothing', async () => {
      for (const routeProbe of [() => Promise.reject(new Error('probe failed')), () => Promise.resolve(undefined)]) {
        const controller = new HostRuntimeController(options({
          postgres: new FakePostgres(),
          helperFactory: () => new FakeHelper(),
          interfaceProvider: provider,
          routeProbe,
        }));

        await expect(controller.start()).resolves.toMatchObject({ selectedLanUrl: 'http://192.168.1.15:43123' });
        await controller.stop();
      }
    });
  });

  it('can stop and restart without coupling authority to a renderer lifecycle', async () => {
    const postgres = new FakePostgres();
    const helpers = [new FakeHelper(), new FakeHelper()];
    const controller = new HostRuntimeController(options({
      postgres,
      helperFactory: () => helpers.shift()!,
    }));

    await controller.start();
    const unchanged = controller.status;
    expect(controller.status).toEqual(unchanged);
    await controller.stop();
    await controller.start();

    expect(postgres.starts).toBe(2);
    expect(controller.status.state).toBe('HOSTING');
    await controller.stop();
  });
});
