import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HostRuntimeController, type ServerHelperLike } from '../src/hostRuntime';
import type { ConnectivityProvider } from '../src/online/connectivity';
import type { ServerHelperInfo, ServerHelperState } from '../src/serverHelper';

class FakeHelper implements ServerHelperLike {
  state: ServerHelperState = 'STOPPED';
  diagnostic = '';
  starts = 0;
  stops = 0;
  startError?: Error;
  healthError?: Error;
  published: string[][] = [];
  private listener?: (diagnostic: string) => void;
  constructor(private readonly port = 43123, private readonly host = '0.0.0.0') {}
  async start(): Promise<ServerHelperInfo> {
    this.starts += 1;
    if (this.startError) throw this.startError;
    this.state = 'READY';
    return { host: this.host, port: this.port, pid: 123 };
  }
  async stop(): Promise<void> { this.stops += 1; this.state = 'STOPPED'; }
  async checkHealth(): Promise<void> { if (this.healthError) throw this.healthError; }
  setPublicEndpoints(endpoints: readonly string[]): void { this.published.push([...endpoints]); }
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
  it('scopes the private creation capability to one room and helper lifetime', async () => {
    const controller = new HostRuntimeController(options({ helperFactory: () => new FakeHelper() }));
    await controller.start({ mode: 'LAN', roomCode: 'HOST-ROOM' });
    const capability = controller.creationCapability('HOST-ROOM');
    expect(capability).toMatch(/^[a-f0-9]{64}$/u);
    expect(controller.creationCapability('OTHER-ROOM')).toBeUndefined();
    expect(JSON.stringify(controller.status)).not.toContain(capability);
    await controller.stop();
    expect(controller.creationCapability('HOST-ROOM')).toBeUndefined();
    await controller.start({ mode: 'LAN', roomCode: 'HOST-ROOM' });
    expect(controller.creationCapability('HOST-ROOM')).not.toBe(capability);
    await controller.stop();
  });

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

  it('uses only IPv4 loopback in local acceptance mode and disables online and network probes', async () => {
    const routeProbe = vi.fn(() => Promise.resolve('192.168.1.15'));
    const interfaceProvider = vi.fn(() => interfaces);
    const tunnel = new FakeTunnel();
    const helpers = [new FakeHelper(43123, '127.0.0.1'), new FakeHelper(43124, '127.0.0.1')];
    let nextHelper = 0;
    const helperFactory = vi.fn((port: number, host: string, localAcceptance: boolean) => {
      expect(port).toBe(0);
      expect(host).toBe('127.0.0.1');
      expect(localAcceptance).toBe(true);
      return helpers[nextHelper++]!;
    });
    const controller = new HostRuntimeController(options({
      localAcceptance: true,
      defaultPort: 0,
      routeProbe,
      interfaceProvider,
      connectivity: tunnel,
      helperFactory,
    }));

    await expect(controller.start({ mode: 'ONLINE', roomCode: 'LOCAL-1' }))
      .rejects.toThrow('ONLINE_DISABLED_LOOPBACK_ACCEPTANCE');
    await expect(controller.resolveOnlineRoom('LOCAL-1'))
      .rejects.toThrow('ONLINE_DISABLED_LOOPBACK_ACCEPTANCE');
    await expect(controller.activateOnlineRoom('LOCAL-1'))
      .rejects.toThrow('ONLINE_DISABLED_LOOPBACK_ACCEPTANCE');

    const first = await controller.start({ mode: 'LAN', roomCode: 'LOCAL-1' });
    expect(first).toMatchObject({
      state: 'HOSTING',
      localAcceptanceMode: true,
      localEndpoint: 'http://127.0.0.1:43123',
      selectedLanUrl: null,
      interfaces: [],
      advertisedEndpoints: [],
      lanAvailable: false,
      onlineEndpoint: null,
    });
    expect(helperFactory).toHaveBeenCalledWith(0, '127.0.0.1', true);
    expect(routeProbe).not.toHaveBeenCalled();
    expect(interfaceProvider).not.toHaveBeenCalled();
    expect(tunnel.starts).toBe(0);
    expect(tunnel.stops).toBe(0);
    expect(controller.refreshNetwork()).toEqual(first);
    expect(() => controller.refreshNetwork('192.168.1.15')).toThrow('LAN_ADDRESS_DISABLED_LOOPBACK_ACCEPTANCE');

    await controller.stop();
    const second = await controller.start({ mode: 'LAN', roomCode: 'LOCAL-2' });
    expect(second.localEndpoint).toBe('http://127.0.0.1:43124');
    expect(helperFactory).toHaveBeenCalledTimes(2);
    await controller.stop();
  });
});

class FakeTunnel implements ConnectivityProvider {
  starts = 0;
  stops = 0;
  startOrigins: string[] = [];
  failFrom = Number.POSITIVE_INFINITY;
  lost: (() => void) | undefined;
  constructor(private readonly hostnames: string[] = ['first', 'second', 'third']) {}
  start(localEndpoint: string, onLost: () => void): Promise<string> {
    this.starts += 1;
    this.startOrigins.push(localEndpoint);
    if (this.starts >= this.failFrom) return Promise.reject(new Error('TUNNEL_START_FAILED'));
    this.lost = onLost;
    return Promise.resolve(`https://${this.hostnames[this.starts - 1] ?? `extra${String(this.starts)}`}.trycloudflare.com`);
  }
  stop(): Promise<void> { this.stops += 1; this.lost = undefined; return Promise.resolve(); }
  /** What the Quick Tunnel process does when cloudflared exits on its own. */
  exit(): void { this.lost?.(); }
}

describe('Online Host (Cloudflare Quick Tunnel)', () => {
  const requested: string[] = [];
  /** The public route answers once the tunnel hostname has been announced, as the real edge does after a moment. */
  function publicRoute(roomExists = true): void {
    requested.length = 0;
    vi.stubGlobal('fetch', vi.fn((input: unknown) => {
      const url = String(input);
      requested.push(url);
      if (url.includes('/_otb/room')) return Promise.resolve(new Response(null, { status: roomExists ? 200 : 404 }));
      return Promise.resolve(new Response(url.endsWith('/readyz') ? 'ready' : '<html lang="vi"></html>', { status: 200 }));
    }));
  }
  const online = (tunnel: FakeTunnel, helper = new FakeHelper()) => ({
    helper,
    tunnel,
    controller: new HostRuntimeController(options({ connectivity: tunnel, helperFactory: () => helper })),
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens the tunnel to the local endpoint and presents only the verified public endpoint', async () => {
    publicRoute();
    const { controller, tunnel } = online(new FakeTunnel());
    const status = await controller.start({ mode: 'ONLINE', roomCode: 'ONLINE-1' });
    expect(tunnel.startOrigins).toEqual(['http://127.0.0.1:43123']);
    expect(status).toMatchObject({
      state: 'HOSTING', connectionMode: 'ONLINE',
      onlineEndpoint: 'https://first.trycloudflare.com', onlineState: 'AWAITING_ROOM',
    });
    // The endpoint is only announced after the public route served the readiness probe and the client page.
    expect(requested).toEqual(['https://first.trycloudflare.com/readyz', 'https://first.trycloudflare.com/']);
    await expect(controller.activateOnlineRoom('ONLINE-1')).resolves.toMatchObject({ onlineState: 'READY' });
    await controller.stop();
  });

  it('uses the injected desktop fetch adapter for public and room probes', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Node DNS failed'))));
    const onlineFetch = vi.fn((url: string) => Promise.resolve(new Response(
      url.endsWith('/readyz') ? 'ready' : '<html>Own the Block</html>', { status: 200 },
    )));
    const controller = new HostRuntimeController(options({
      helperFactory: () => new FakeHelper(), connectivity: new FakeTunnel(), onlineFetch,
    }));
    expect(await controller.start({ mode: 'ONLINE', roomCode: 'ONLINE-1' })).toMatchObject({
      onlineEndpoint: 'https://first.trycloudflare.com',
      onlineDiagnostic: { stage: 'PUBLIC_PAGE', outcome: 'PASSED' },
    });
    await controller.activateOnlineRoom('ONLINE-1');
    expect(controller.status.onlineDiagnostic).toMatchObject({ stage: 'PUBLIC_ROOM', outcome: 'PASSED' });
    expect(onlineFetch).toHaveBeenCalledTimes(3);
    expect(fetch).not.toHaveBeenCalled();
    await controller.stop();
  });

  it('withholds the endpoint during transient DNS failure, then hosts after cache refresh and public checks', async () => {
    vi.useFakeTimers();
    const helper = new FakeHelper();
    let negativeCache = true;
    const onlineResolver = {
      resolve: vi.fn(() => Promise.resolve()),
      clearCache: vi.fn(() => { negativeCache = false; return Promise.resolve(); }),
    };
    const onlineFetch = vi.fn((url: string) => negativeCache
      ? Promise.reject(new Error('net::ERR_NAME_NOT_RESOLVED'))
      : Promise.resolve(new Response(url.endsWith('/readyz') ? 'ready' : '<html>Own the Block</html>')));
    const controller = new HostRuntimeController(options({
      helperFactory: () => helper, connectivity: new FakeTunnel(), onlineFetch, onlineResolver,
    }));
    const starting = controller.start({ mode: 'ONLINE', roomCode: 'ONLINE-1' });
    await vi.advanceTimersByTimeAsync(100);
    expect(controller.status.onlineEndpoint).toBeNull();
    expect(helper.published).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(await starting).toMatchObject({ state: 'HOSTING', onlineEndpoint: 'https://first.trycloudflare.com',
      onlineDiagnostic: { stage: 'PUBLIC_PAGE', outcome: 'PASSED', resolverCache: 'CLEARED' } });
    expect(onlineResolver.clearCache).toHaveBeenCalledOnce();
    await controller.stop();
  });

  it('retries a transient room probe response before making the invitation ready', async () => {
    let roomAttempts = 0;
    const onlineFetch = vi.fn((url: string) => {
      if (url.includes('/_otb/room')) {
        roomAttempts += 1;
        return Promise.resolve(new Response(null, { status: roomAttempts === 1 ? 503 : 200 }));
      }
      return Promise.resolve(new Response(url.endsWith('/readyz') ? 'ready' : '<html>game</html>'));
    });
    const controller = new HostRuntimeController(options({
      helperFactory: () => new FakeHelper(), connectivity: new FakeTunnel(), onlineFetch,
    }));
    await controller.start({ mode: 'ONLINE', roomCode: 'ONLINE-1' });
    expect(await controller.activateOnlineRoom('ONLINE-1')).toMatchObject({ onlineState: 'READY',
      onlineDiagnostic: { stage: 'PUBLIC_ROOM', outcome: 'PASSED', attempts: 2 } });
    expect(roomAttempts).toBe(2);
    await controller.stop();
  });

  it('cancels a pending public probe on Host stop without publishing its URL', async () => {
    const tunnel = new FakeTunnel();
    const helper = new FakeHelper();
    const onlineFetch = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('AbortError')), { once: true });
    }));
    const controller = new HostRuntimeController(options({ connectivity: tunnel, helperFactory: () => helper, onlineFetch }));
    const starting = controller.start({ mode: 'ONLINE', roomCode: 'ONLINE-1' }).catch(() => undefined);
    await vi.waitFor(() => expect(onlineFetch).toHaveBeenCalledOnce());
    await controller.stop();
    await starting;
    expect(controller.status).toMatchObject({ state: 'IDLE', onlineEndpoint: null });
    expect(helper.published).not.toContainEqual(['https://first.trycloudflare.com']);
    expect(tunnel.starts).toBe(1);
  });

  it('records tunnel exit during the public probe and never publishes that hostname', async () => {
    const tunnel = new FakeTunnel();
    const helper = new FakeHelper();
    const onlineFetch = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('AbortError')), { once: true });
    }));
    const controller = new HostRuntimeController(options({ connectivity: tunnel, helperFactory: () => helper, onlineFetch }));
    const outcome = controller.start({ mode: 'ONLINE', roomCode: 'ONLINE-1' }).catch(() => undefined);
    await vi.waitFor(() => expect(onlineFetch).toHaveBeenCalledOnce());
    tunnel.exit();
    await outcome;
    expect(controller.status).toMatchObject({ state: 'FAILED', onlineEndpoint: null,
      onlineDiagnostic: { stage: 'PUBLIC_READINESS', outcome: 'FAILED', reason: 'TUNNEL_EXIT' } });
    expect(helper.published).not.toContainEqual(['https://first.trycloudflare.com']);
  });

  it('fails the start, ends the server and revokes the Host capability when the tunnel cannot start', async () => {
    publicRoute();
    const tunnel = new FakeTunnel();
    tunnel.failFrom = 1;
    const { controller, helper } = online(tunnel);
    await expect(controller.start({ mode: 'ONLINE', roomCode: 'ONLINE-1' })).rejects.toThrow('TUNNEL_START_FAILED');
    expect(controller.status).toMatchObject({ state: 'FAILED', errorCode: 'ONLINE_FAILED', onlineEndpoint: null });
    expect(helper.stops).toBeGreaterThanOrEqual(1);
    expect(tunnel.stops).toBeGreaterThanOrEqual(1);
    expect(controller.creationCapability('ONLINE-1')).toBeUndefined();
  });

  it('does not present an endpoint whose public route never becomes reachable', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('getaddrinfo ENOTFOUND'))));
    const { controller, helper, tunnel } = online(new FakeTunnel());
    const starting = controller.start({ mode: 'ONLINE', roomCode: 'ONLINE-1' });
    const outcome = starting.then(() => 'started', (error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(155_000);
    await expect(outcome).resolves.toBe('ONLINE_FAILED');
    expect(controller.status).toMatchObject({ state: 'FAILED', errorCode: 'ONLINE_FAILED', onlineEndpoint: null });
    expect(tunnel.stops).toBeGreaterThanOrEqual(1);
    expect(helper.stops).toBeGreaterThanOrEqual(1);
  });

  it('recreates a lost tunnel with a new hostname and never presents the old link as current again', async () => {
    publicRoute();
    const { controller, tunnel, helper } = online(new FakeTunnel());
    const seen: Array<{ endpoint: string | null | undefined; state: string | undefined }> = [];
    controller.onStatusChanged(status => seen.push({ endpoint: status.onlineEndpoint, state: status.onlineState }));
    await controller.start({ mode: 'ONLINE', roomCode: 'ONLINE-1' });
    await controller.activateOnlineRoom('ONLINE-1');
    expect(controller.status.onlineEndpoint).toBe('https://first.trycloudflare.com');
    seen.length = 0;

    tunnel.exit();
    await vi.waitFor(() => expect(controller.status).toMatchObject({
      onlineEndpoint: 'https://second.trycloudflare.com', onlineState: 'READY',
    }));
    expect(tunnel.starts).toBe(2);
    // The first update after the loss withdraws the old link; it never reappears.
    expect(seen[0]).toEqual({ endpoint: null, state: 'UNAVAILABLE' });
    expect(seen.map(entry => entry.endpoint)).not.toContain('https://first.trycloudflare.com');
    expect(seen.map(entry => entry.endpoint)).toContain('https://second.trycloudflare.com');
    // The authoritative server and its Host capability survived the tunnel loss.
    expect(controller.status.state).toBe('HOSTING');
    expect(helper.stops).toBe(0);
    expect(controller.creationCapability('ONLINE-1')).toMatch(/^[a-f0-9]{64}$/u);
    // The server process signs continuity only for its current tunnel: the old address is withdrawn, the new one published.
    expect(helper.published).toEqual([['https://first.trycloudflare.com'], [], ['https://second.trycloudflare.com']]);
    await controller.stop();
  });

  it('keeps a healthy server running, with no invitation, when the tunnel cannot be recreated', async () => {
    vi.useFakeTimers();
    publicRoute();
    const tunnel = new FakeTunnel();
    const { controller, helper } = online(tunnel);
    await controller.start({ mode: 'ONLINE', roomCode: 'ONLINE-1' });
    await controller.activateOnlineRoom('ONLINE-1');
    tunnel.failFrom = 2;
    tunnel.exit();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(tunnel.starts).toBe(3);
    expect(controller.status).toMatchObject({ state: 'HOSTING', onlineEndpoint: null, onlineState: 'UNAVAILABLE' });
    expect(helper.stops).toBe(0);
    expect(helper.state).toBe('READY');
    await controller.stop();
  });

  it('terminates the managed tunnel and withdraws the invitation when the application shuts the Host down', async () => {
    publicRoute();
    const { controller, tunnel, helper } = online(new FakeTunnel());
    await controller.start({ mode: 'ONLINE', roomCode: 'ONLINE-1' });
    await controller.activateOnlineRoom('ONLINE-1');
    await controller.stop();
    expect(tunnel.stops).toBeGreaterThanOrEqual(1);
    expect(helper.stops).toBe(1);
    expect(controller.status).toMatchObject({ state: 'IDLE', onlineEndpoint: null });
    expect(controller.creationCapability('ONLINE-1')).toBeUndefined();
    // A tunnel that exits after the shutdown must not bring anything back.
    tunnel.exit();
    expect(tunnel.starts).toBe(1);
  });

  it('ends the match for good, tunnel included, when the authoritative server dies', async () => {
    publicRoute();
    const { controller, tunnel, helper } = online(new FakeTunnel());
    await controller.start({ mode: 'ONLINE', roomCode: 'ONLINE-1' });
    helper.crash();
    await vi.waitFor(() => expect(controller.status.state).toBe('FAILED'));
    expect(tunnel.stops).toBeGreaterThanOrEqual(1);
    expect(helper.starts).toBe(1);
    expect(controller.status.onlineEndpoint).toBeNull();
    expect(controller.creationCapability('ONLINE-1')).toBeUndefined();
  });
});
