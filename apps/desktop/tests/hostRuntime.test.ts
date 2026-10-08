import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { HostRuntimeController, type ServerHelperLike } from '../src/hostRuntime';
import type { ServerHelperInfo, ServerHelperState } from '../src/serverHelper';

class FakeHelper implements ServerHelperLike {
  state: ServerHelperState = 'STOPPED';
  diagnostic = '';
  starts = 0;
  stops = 0;
  startError?: Error;
  healthError?: Error;
  private listener?: (diagnostic: string) => void;
  constructor(private readonly port = 43123) {}
  async start(): Promise<ServerHelperInfo> {
    this.starts += 1;
    if (this.startError) throw this.startError;
    this.state = 'READY';
    return { host: '0.0.0.0', port: this.port, pid: 123 };
  }
  async stop(): Promise<void> { this.stops += 1; this.state = 'STOPPED'; }
  async checkHealth(): Promise<void> { if (this.healthError) throw this.healthError; }
  onUnexpectedExit(listener: (diagnostic: string) => void): () => void {
    this.listener = listener;
    return () => { this.listener = undefined; };
  }
  crash(): void { this.state = 'FAILED'; this.listener?.('server helper exited unexpectedly'); }
}

const interfaces = [{ name: 'Wi-Fi', displayName: 'Wi-Fi', address: '192.168.1.15',
  netmask: '255.255.255.0', preference: 'preferred' as const, rank: 0 }];
const options = (overrides: Partial<ConstructorParameters<typeof HostRuntimeController>[0]> = {}) => ({
  helperPath: path.resolve('generated/server-helper/server-helper.cjs'),
  clientDist: path.resolve('client/dist'),
  appVersion: '3.0.0',
  defaultPort: 43123,
  interfaceProvider: () => interfaces,
  healthCheckIntervalMs: 0,
  ...overrides,
});

describe('RAM host runtime', () => {
  it('starts one helper and advertises a usable LAN endpoint', async () => {
    const helper = new FakeHelper();
    const controller = new HostRuntimeController(options({ helperFactory: () => helper }));
    const [a, b] = await Promise.all([controller.start(), controller.start()]);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ state: 'HOSTING', selectedLanUrl: 'http://192.168.1.15:43123',
      localEndpoint: 'http://127.0.0.1:43123' });
    expect(helper.starts).toBe(1);
    await controller.stop();
    expect(helper.stops).toBe(1);
    expect(controller.status.state).toBe('IDLE');
  });

  it('retries automatic port conflicts before presenting the actual port', async () => {
    const first = new FakeHelper();
    first.startError = new Error('EADDRINUSE');
    const second = new FakeHelper(53120);
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const controller = new HostRuntimeController(options({ defaultPort: 0, helperFactory: factory }));
    expect(await controller.start()).toMatchObject({ gamePort: 53120,
      selectedLanUrl: 'http://192.168.1.15:53120' });
    expect(factory).toHaveBeenCalledTimes(2);
    await controller.stop();
  });

  it('ends a match permanently when its authoritative helper crashes', async () => {
    const helper = new FakeHelper();
    const factory = vi.fn(() => helper);
    const controller = new HostRuntimeController(options({ helperFactory: factory }));
    await controller.start();
    helper.crash();
    await vi.waitFor(() => expect(controller.status.state).toBe('FAILED'));
    expect(factory).toHaveBeenCalledTimes(1);
    expect(controller.status.diagnostic).toContain('exited unexpectedly');
  });

  it('treats lost helper readiness as a terminal session', async () => {
    const helper = new FakeHelper();
    const controller = new HostRuntimeController(options({ helperFactory: () => helper }));
    await controller.start();
    helper.healthError = new Error('server unavailable');
    await controller.verifyAndRecover();
    expect(controller.status.state).toBe('FAILED');
  });

  it('requires an advertised interface for LAN but allows online hosting without one', async () => {
    const lan = new HostRuntimeController(options({ interfaceProvider: () => [], helperFactory: () => new FakeHelper() }));
    await expect(lan.start()).rejects.toThrow('No usable LAN IPv4');
    expect(lan.status.errorCode).toBe('NO_LAN_INTERFACE');
  });
});
