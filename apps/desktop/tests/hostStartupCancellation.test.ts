import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { HostRuntimeController, type HostRuntimeOptions, type HostRuntimeStatus, type ServerHelperLike } from '../src/hostRuntime';
import type { ConnectivityProvider, TunnelStartOptions } from '../src/online/connectivity';
import type { RoomDiscoveryProvider } from '../src/online/discovery';
import type { ServerHelperInfo, ServerHelperState } from '../src/serverHelper';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

const info: ServerHelperInfo = { host: '0.0.0.0', port: 43123, pid: 123 };
const interfaces = [{ name: 'Wi-Fi', displayName: 'Wi-Fi', address: '192.168.1.15',
  netmask: '255.255.255.0', preference: 'preferred' as const, rank: 0 }];

/** A resource appears when its deferred start resolves, including after cancellation. */
class OwnedHelper implements ServerHelperLike {
  state: ServerHelperState = 'STOPPED';
  diagnostic = '';
  starts = 0;
  stops = 0;
  alive = false;
  stopFailures = 0;
  readonly entered = deferred<void>();
  readonly stopEntered = deferred<void>();
  readonly published: string[][] = [];
  constructor(private readonly startup: Promise<ServerHelperInfo> = Promise.resolve(info),
    private readonly shutdown: Promise<void> = Promise.resolve()) {}
  async start(): Promise<ServerHelperInfo> {
    this.starts += 1;
    this.entered.resolve();
    const ready = await this.startup;
    this.alive = true;
    this.state = 'READY';
    return ready;
  }
  async stop(): Promise<void> {
    this.stops += 1;
    this.stopEntered.resolve();
    await this.shutdown;
    if (this.stopFailures > 0) { this.stopFailures -= 1; throw new Error('helper stop failed'); }
    this.alive = false;
    this.state = 'STOPPED';
  }
  setPublicEndpoints(endpoints: readonly string[]): void { this.published.push([...endpoints]); }
}

class OwnedTunnel implements ConnectivityProvider {
  starts = 0;
  stops = 0;
  alive = false;
  signal?: AbortSignal;
  stopFailures = 0;
  readonly entered = deferred<void>();
  constructor(private readonly startup: Promise<string> = Promise.resolve('https://owned.trycloudflare.com')) {}
  async start(_origin: string, _lost: () => void, options?: TunnelStartOptions): Promise<string> {
    this.starts += 1;
    this.signal = options?.signal;
    this.entered.resolve();
    // Intentionally ignore abort while creating the resource: the owner must drain and close it.
    const endpoint = await this.startup;
    this.alive = true;
    return endpoint;
  }
  async stop(): Promise<void> {
    this.stops += 1;
    if (this.stopFailures > 0) { this.stopFailures -= 1; throw new Error('tunnel stop failed'); }
    this.alive = false;
  }
}

function discovery(reserve: RoomDiscoveryProvider['reserve'] = async code => ({ credential: code, proof: code })) {
  return { reserve: vi.fn(reserve), activate: vi.fn(async () => undefined), renew: vi.fn(async () => undefined),
    suspend: vi.fn(async () => undefined), revoke: vi.fn(async () => undefined), resolve: vi.fn(async () => null) };
}

function runtime(overrides: Partial<HostRuntimeOptions> = {}) {
  return new HostRuntimeController({ helperPath: path.resolve('generated/server-helper/server-helper.cjs'),
    clientDist: path.resolve('client/dist'), appVersion: '1.10.0', defaultPort: info.port,
    interfaceProvider: () => interfaces, healthCheckIntervalMs: 0, ...overrides });
}

const publicRoute = vi.fn(async (url: string) => new Response(url.endsWith('/readyz') ? 'ready' : '<html>Own the Block</html>'));
const observe = (promise: Promise<HostRuntimeStatus>) => promise.then(status => ({ status }), (error: unknown) => ({ error }));
function expectCancelled(outcome: Awaited<ReturnType<typeof observe>>) {
  expect('error' in outcome && outcome.error).toBeInstanceOf(Error);
  expect('error' in outcome && (outcome.error as Error).message).toBe('HOST_START_CANCELLED');
}

describe('E1-FIX-003 pending Host lifecycle ownership', () => {
  it('publishes busy status synchronously while LAN preflight is deferred', async () => {
    const route = deferred<string | undefined>();
    const helper = new OwnedHelper();
    const controller = runtime({ routeProbe: () => route.promise, helperFactory: () => helper });
    const starting = observe(controller.start({ roomCode: 'LAN-PENDING' }));
    expect(controller.status.state).toBe('STARTING_SERVER');
    expect(controller.isBusy).toBe(true);
    const stopping = controller.stop();
    route.resolve('192.168.1.15');
    await stopping;
    expectCancelled(await starting);
    expect(helper.starts).toBe(0);
    expect(controller.status.state).toBe('IDLE');
    expect(controller.creationCapability('LAN-PENDING')).toBeUndefined();
    expect(controller.isBusy).toBe(false);
  });

  it('revokes a reservation acquired after cancellation without starting helper or tunnel', async () => {
    const reservation = deferred<{ credential: string; proof: string }>();
    const reserved = deferred<void>();
    const registry = discovery(() => { reserved.resolve(); return reservation.promise; });
    const helper = new OwnedHelper();
    const tunnel = new OwnedTunnel();
    const controller = runtime({ discovery: registry, connectivity: tunnel, helperFactory: () => helper, onlineFetch: publicRoute });
    const starting = observe(controller.start({ mode: 'ONLINE', roomCode: 'CANCEL-RESERVE' }));
    expect(controller.status.state).toBe('STARTING_SERVER');
    await reserved.promise;
    const stopping = controller.stop();
    reservation.resolve({ credential: 'owned-credential', proof: 'owned-proof' });
    await stopping;
    expectCancelled(await starting);
    expect(registry.revoke.mock.calls).toEqual([['CANCEL-RESERVE', 'owned-credential']]);
    expect(helper.starts).toBe(0);
    expect(tunnel.starts).toBe(0);
    expect(controller.status).toMatchObject({ state: 'IDLE', onlineEndpoint: null });
  });

  it('drains deferred helper startup and stops the resulting resource exactly once', async () => {
    const ready = deferred<ServerHelperInfo>();
    const helper = new OwnedHelper(ready.promise);
    const factory = vi.fn(() => helper);
    const controller = runtime({ helperFactory: factory });
    const statuses: string[] = [];
    controller.onStatusChanged(status => statuses.push(status.state));
    const starting = observe(controller.start({ roomCode: 'HELPER-CANCEL' }));
    await helper.entered.promise;
    const stopping = controller.stop();
    expect(controller.status.state).toBe('STOPPING');
    ready.resolve(info);
    await stopping;
    expectCancelled(await starting);
    expect(factory).toHaveBeenCalledOnce();
    expect(helper.stops).toBe(1);
    expect(helper.alive).toBe(false);
    expect(statuses.slice(statuses.indexOf('STOPPING'))).not.toContain('HOSTING');
    expect(controller.status.state).toBe('IDLE');
  });

  it('does not open a tunnel when Stop arrives while the Online helper is starting', async () => {
    const ready = deferred<ServerHelperInfo>();
    const helper = new OwnedHelper(ready.promise);
    const tunnel = new OwnedTunnel();
    const controller = runtime({ discovery: discovery(), connectivity: tunnel, helperFactory: () => helper, onlineFetch: publicRoute });
    const starting = observe(controller.start({ mode: 'ONLINE', roomCode: 'ONLINE-HELPER' }));
    await helper.entered.promise;
    const stopping = controller.stop();
    ready.resolve(info);
    await stopping;
    expectCancelled(await starting);
    expect(helper.alive).toBe(false);
    expect(helper.stops).toBe(1);
    expect(tunnel.starts).toBe(0);
    expect(controller.status).toMatchObject({ state: 'IDLE', onlineEndpoint: null });
  });

  it('closes a tunnel that finishes creating after Stop and never publishes its endpoint', async () => {
    const connected = deferred<string>();
    const helper = new OwnedHelper();
    const tunnel = new OwnedTunnel(connected.promise);
    const controller = runtime({ discovery: discovery(), connectivity: tunnel, helperFactory: () => helper, onlineFetch: publicRoute });
    const seen: HostRuntimeStatus[] = [];
    controller.onStatusChanged(status => seen.push(status));
    const starting = observe(controller.start({ mode: 'ONLINE', roomCode: 'TUNNEL-CANCEL' }));
    await tunnel.entered.promise;
    const stopping = controller.stop();
    expect(tunnel.signal?.aborted).toBe(true);
    connected.resolve('https://cancelled.trycloudflare.com');
    await stopping;
    expectCancelled(await starting);
    expect(tunnel.alive).toBe(false);
    expect(helper.alive).toBe(false);
    expect(helper.stops).toBe(1);
    expect(tunnel.stops).toBe(1);
    expect(seen.some(status => Boolean(status.onlineEndpoint))).toBe(false);
    expect(helper.published).not.toContainEqual(['https://cancelled.trycloudflare.com']);
    expect(controller.status).toMatchObject({ state: 'IDLE', onlineEndpoint: null });
  });

  it('coalesces duplicate Stops while helper startup and shutdown are both pending', async () => {
    const ready = deferred<ServerHelperInfo>();
    const stopped = deferred<void>();
    const helper = new OwnedHelper(ready.promise, stopped.promise);
    const controller = runtime({ helperFactory: () => helper });
    const starting = observe(controller.start({ roomCode: 'DUPLICATE-STOP' }));
    await helper.entered.promise;
    const first = controller.stop();
    const second = controller.stop();
    let settled = false;
    void Promise.all([first, second]).then(() => { settled = true; });
    ready.resolve(info);
    await helper.stopEntered.promise;
    expect(settled).toBe(false);
    expect(controller.status.state).toBe('STOPPING');
    stopped.resolve();
    const outcomes = await Promise.all([first, second]);
    expect(outcomes.map(status => status.state)).toEqual(['IDLE', 'IDLE']);
    expectCancelled(await starting);
    expect(helper.stops).toBe(1);
    expect(helper.alive).toBe(false);
  });

  it('lets only the new room acquire resources in Start/Stop/Start with old route rejection', async () => {
    const route = deferred<string | undefined>();
    const helper = new OwnedHelper();
    const factory = vi.fn(() => helper);
    const routeEntered = deferred<void>();
    const routeProbe = vi.fn().mockImplementationOnce(() => { routeEntered.resolve(); return route.promise; })
      .mockResolvedValue('192.168.1.15');
    const controller = runtime({ routeProbe, helperFactory: factory });
    const obsolete = observe(controller.start({ roomCode: 'ROOM-OLD' }));
    await routeEntered.promise;
    const stopping = controller.stop();
    const next = controller.start({ roomCode: 'ROOM-NEW' });
    route.reject(new Error('obsolete route probe failed'));
    await stopping;
    expect(await next).toMatchObject({ state: 'HOSTING' });
    expectCancelled(await obsolete);
    expect(factory).toHaveBeenCalledOnce();
    expect(helper.starts).toBe(1);
    expect(controller.creationCapability('ROOM-OLD')).toBeUndefined();
    expect(controller.creationCapability('ROOM-NEW')).toMatch(/^[a-f0-9]{64}$/u);
    expect(controller.status).toMatchObject({ state: 'HOSTING', errorCode: undefined });
    await controller.stop();
  });

  it('isolates a cancelled reservation rejection from the next Online room', async () => {
    const reservation = deferred<{ credential: string; proof: string }>();
    const reserved = deferred<void>();
    const registry = discovery(vi.fn().mockImplementationOnce(() => { reserved.resolve(); return reservation.promise; })
      .mockResolvedValue({ credential: 'credential-new', proof: 'proof-new' }));
    const helper = new OwnedHelper();
    const tunnel = new OwnedTunnel();
    const controller = runtime({ discovery: registry, connectivity: tunnel, helperFactory: () => helper, onlineFetch: publicRoute });
    const obsolete = observe(controller.start({ mode: 'ONLINE', roomCode: 'RESERVE-OLD' }));
    await reserved.promise;
    const stopping = controller.stop();
    const next = controller.start({ mode: 'ONLINE', roomCode: 'RESERVE-NEW' });
    reservation.reject(new Error('CODE_TAKEN'));
    await stopping;
    expect(await next).toMatchObject({ state: 'HOSTING', onlineState: 'AWAITING_ROOM' });
    expectCancelled(await obsolete);
    expect(registry.reserve.mock.calls).toEqual([['RESERVE-OLD'], ['RESERVE-NEW']]);
    expect(helper.starts).toBe(1);
    expect(tunnel.starts).toBe(1);
    expect(controller.creationCapability('RESERVE-OLD')).toBeUndefined();
    expect(controller.creationCapability('RESERVE-NEW')).toMatch(/^[a-f0-9]{64}$/u);
    expect(controller.status.errorCode).toBeUndefined();
    await controller.stop();
    expect(registry.revoke.mock.calls).toEqual([['RESERVE-NEW', 'credential-new']]);
  });

  it('rejects a different room while a valid startup is pending instead of returning its capability', async () => {
    const route = deferred<string | undefined>();
    const controller = runtime({ routeProbe: () => route.promise, helperFactory: () => new OwnedHelper() });
    const starting = controller.start({ roomCode: 'ROOM-A' });
    await expect(controller.start({ roomCode: 'ROOM-B' })).rejects.toThrow('HOST_ROOM_CONFLICT');
    route.resolve('192.168.1.15');
    await starting;
    expect(controller.creationCapability('ROOM-B')).toBeUndefined();
    await controller.stop();
  });

  it('preserves same-room coalescing while rejecting a conflicting pending mode', async () => {
    const route = deferred<string | undefined>();
    const helper = new OwnedHelper();
    const controller = runtime({ routeProbe: () => route.promise, helperFactory: () => helper });
    const first = controller.start({ roomCode: 'SAME-ROOM', mode: 'LAN' });
    const same = controller.start({ roomCode: 'SAME-ROOM', mode: 'LAN' });
    await expect(controller.start({ roomCode: 'SAME-ROOM', mode: 'ONLINE' })).rejects.toThrow('HOST_MODE_CONFLICT');
    route.resolve('192.168.1.15');
    const statuses = await Promise.all([first, same]);
    expect(statuses[0]).toEqual(statuses[1]);
    expect(helper.starts).toBe(1);
    await controller.stop();
  });

  it('clears failed startup ownership so a helper failure can be retried', async () => {
    const failure = new OwnedHelper(Promise.reject(new Error('helper readiness failed')));
    const healthy = new OwnedHelper();
    const factory = vi.fn().mockReturnValueOnce(failure).mockReturnValueOnce(healthy);
    const controller = runtime({ helperFactory: factory });
    await expect(controller.start({ roomCode: 'FAIL-THEN-RETRY' })).rejects.toThrow('helper readiness failed');
    expect(controller.status.state).toBe('FAILED');
    expect(failure.alive).toBe(false);
    expect(await controller.start({ roomCode: 'RETRY-ROOM' })).toMatchObject({ state: 'HOSTING' });
    expect(controller.creationCapability('FAIL-THEN-RETRY')).toBeUndefined();
    expect(controller.creationCapability('RETRY-ROOM')).toMatch(/^[a-f0-9]{64}$/u);
    expect(factory).toHaveBeenCalledTimes(2);
    await controller.stop();
  });

  it('clears rejected reservation ownership and permits a legitimate retry', async () => {
    const registry = discovery(vi.fn().mockRejectedValueOnce(new Error('CODE_TAKEN'))
      .mockResolvedValue({ credential: 'retry-credential', proof: 'retry-proof' }));
    const helper = new OwnedHelper();
    const controller = runtime({ discovery: registry, connectivity: new OwnedTunnel(), helperFactory: () => helper, onlineFetch: publicRoute });
    await expect(controller.start({ mode: 'ONLINE', roomCode: 'TAKEN' })).rejects.toThrow('CODE_TAKEN');
    expect(controller.status.state).toBe('FAILED');
    expect(helper.starts).toBe(0);
    expect(await controller.start({ mode: 'ONLINE', roomCode: 'FREE' })).toMatchObject({ state: 'HOSTING' });
    expect(controller.creationCapability('TAKEN')).toBeUndefined();
    expect(controller.creationCapability('FREE')).toMatch(/^[a-f0-9]{64}$/u);
    await controller.stop();
  });

  it('keeps failed shutdown resources owned until a subsequent Stop succeeds', async () => {
    const helper = new OwnedHelper();
    const controller = runtime({ helperFactory: () => helper });
    await controller.start({ roomCode: 'STOP-RETRY' });
    helper.stopFailures = 1;
    await expect(controller.stop()).rejects.toThrow('helper stop failed');
    expect(controller.status.state).toBe('FAILED');
    expect(helper.alive).toBe(true);
    expect(controller.isBusy).toBe(true);
    expect(controller.creationCapability('STOP-RETRY')).toBeUndefined();
    await controller.stop();
    expect(helper.stops).toBe(2);
    expect(helper.alive).toBe(false);
    expect(controller.status.state).toBe('IDLE');
    expect(controller.isBusy).toBe(false);
  });

  it('does not let a new Start replace a helper whose cleanup failed', async () => {
    const old = new OwnedHelper();
    const next = new OwnedHelper();
    const factory = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(next);
    const controller = runtime({ helperFactory: factory });
    await controller.start({ roomCode: 'OWNED-OLD' });
    old.stopFailures = 1;
    await expect(controller.stop()).rejects.toThrow('helper stop failed');
    await controller.start({ roomCode: 'OWNED-NEW' });
    expect(old.alive).toBe(false);
    expect(old.stops).toBe(2);
    expect(next.alive).toBe(true);
    expect(next.stops).toBe(0);
    expect(controller.creationCapability('OWNED-NEW')).toMatch(/^[a-f0-9]{64}$/u);
    await controller.stop();
  });

  it('owns startup before a status listener can synchronously cancel it', async () => {
    const helper = new OwnedHelper();
    const controller = runtime({ helperFactory: () => helper });
    let stopping: Promise<HostRuntimeStatus> | undefined;
    controller.onStatusChanged(status => {
      if (status.state === 'STARTING_SERVER' && !stopping) stopping = controller.stop();
    });
    const starting = observe(controller.start({ roomCode: 'REENTRANT-CANCEL' }));
    expect(stopping).toBeDefined();
    await stopping;
    expectCancelled(await starting);
    expect(helper.starts).toBe(0);
    expect(controller.status.state).toBe('IDLE');
  });

  it('coalesces a same-room Start called reentrantly from initial busy status', async () => {
    const helper = new OwnedHelper();
    const controller = runtime({ helperFactory: () => helper });
    let nested: Promise<HostRuntimeStatus> | undefined;
    controller.onStatusChanged(status => {
      if (status.state === 'STARTING_SERVER' && !nested) nested = controller.start({ roomCode: 'REENTRANT-START' });
    });
    const first = controller.start({ roomCode: 'REENTRANT-START' });
    expect(nested).toBeDefined();
    expect(await nested).toEqual(await first);
    expect(helper.starts).toBe(1);
    await controller.stop();
  });

  it('queues a Start requested by a STOPPING listener behind old cleanup', async () => {
    const old = new OwnedHelper();
    const next = new OwnedHelper();
    const factory = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(next);
    const controller = runtime({ helperFactory: factory });
    await controller.start({ roomCode: 'CALLBACK-OLD' });
    let nextStart: Promise<HostRuntimeStatus> | undefined;
    controller.onStatusChanged(status => {
      if (status.state === 'STOPPING' && !nextStart) nextStart = controller.start({ roomCode: 'CALLBACK-NEW' });
    });
    await controller.stop();
    expect(nextStart).toBeDefined();
    expect(await nextStart).toMatchObject({ state: 'HOSTING' });
    expect(old.stops).toBe(1);
    expect(old.alive).toBe(false);
    expect(next.starts).toBe(1);
    expect(next.stops).toBe(0);
    expect(controller.creationCapability('CALLBACK-OLD')).toBeUndefined();
    expect(controller.creationCapability('CALLBACK-NEW')).toMatch(/^[a-f0-9]{64}$/u);
    await controller.stop();
  });

  it('coalesces a Stop called reentrantly by a STOPPING listener', async () => {
    const helper = new OwnedHelper();
    const controller = runtime({ helperFactory: () => helper });
    await controller.start({ roomCode: 'CALLBACK-STOP' });
    let nested: Promise<HostRuntimeStatus> | undefined;
    controller.onStatusChanged(status => {
      if (status.state === 'STOPPING' && !nested) nested = controller.stop();
    });
    await controller.stop();
    expect(await nested).toMatchObject({ state: 'IDLE' });
    expect(helper.stops).toBe(1);
    expect(helper.alive).toBe(false);
  });
  it('cleans a helper startup rejection after cancellation without replacing IDLE with FAILED', async () => {
    const ready = deferred<ServerHelperInfo>();
    const helper = new OwnedHelper(ready.promise);
    const controller = runtime({ helperFactory: () => helper });
    const starting = observe(controller.start({ roomCode: 'HELPER-REJECT' }));
    await helper.entered.promise;
    const stopping = controller.stop();
    ready.reject(new Error('helper became unavailable during cancellation'));
    await stopping;
    expectCancelled(await starting);
    expect(helper.alive).toBe(false);
    expect(helper.stops).toBe(1);
    expect(controller.status).toMatchObject({ state: 'IDLE', errorCode: undefined });
  });

  it('cleans a tunnel startup rejection after cancellation without publishing a failed old lifecycle', async () => {
    const connected = deferred<string>();
    const helper = new OwnedHelper();
    const tunnel = new OwnedTunnel(connected.promise);
    const controller = runtime({ discovery: discovery(), connectivity: tunnel, helperFactory: () => helper, onlineFetch: publicRoute });
    const starting = observe(controller.start({ mode: 'ONLINE', roomCode: 'TUNNEL-REJECT' }));
    await tunnel.entered.promise;
    const stopping = controller.stop();
    connected.reject(new Error('TUNNEL_EXIT_EARLY'));
    await stopping;
    expectCancelled(await starting);
    expect(helper.stops).toBe(1);
    expect(tunnel.stops).toBe(1);
    expect(helper.alive).toBe(false);
    expect(tunnel.alive).toBe(false);
    expect(controller.status).toMatchObject({ state: 'IDLE', onlineEndpoint: null, errorCode: undefined });
  });

  it('keeps the final room and its helper isolated through consecutive Start/Stop generations', async () => {
    const firstReady = deferred<ServerHelperInfo>();
    const secondReady = deferred<ServerHelperInfo>();
    const first = new OwnedHelper(firstReady.promise);
    const second = new OwnedHelper(secondReady.promise);
    const final = new OwnedHelper();
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second).mockReturnValueOnce(final);
    const controller = runtime({ helperFactory: factory });
    const startA = observe(controller.start({ roomCode: 'GENERATION-A' }));
    await first.entered.promise;
    const stopA = controller.stop();
    const startB = observe(controller.start({ roomCode: 'GENERATION-B' }));
    firstReady.resolve(info);
    await stopA;
    await second.entered.promise;
    const stopB = controller.stop();
    const startC = controller.start({ roomCode: 'GENERATION-C' });
    secondReady.resolve(info);
    await stopB;
    expect(await startC).toMatchObject({ state: 'HOSTING' });
    expectCancelled(await startA);
    expectCancelled(await startB);
    expect(first.stops).toBe(1);
    expect(second.stops).toBe(1);
    expect(first.alive).toBe(false);
    expect(second.alive).toBe(false);
    expect(final.alive).toBe(true);
    expect(final.stops).toBe(0);
    expect(controller.creationCapability('GENERATION-A')).toBeUndefined();
    expect(controller.creationCapability('GENERATION-B')).toBeUndefined();
    expect(controller.creationCapability('GENERATION-C')).toMatch(/^[a-f0-9]{64}$/u);
    await controller.stop();
  });

  it('cleans a failed tunnel and retries with a new helper and room', async () => {
    const old = new OwnedHelper();
    const next = new OwnedHelper();
    const factory = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(next);
    const tunnel = new OwnedTunnel();
    vi.spyOn(tunnel, 'start').mockRejectedValueOnce(new Error('TUNNEL_START_FAILED'));
    const registry = discovery();
    const controller = runtime({ discovery: registry, connectivity: tunnel, helperFactory: factory, onlineFetch: publicRoute });
    await expect(controller.start({ mode: 'ONLINE', roomCode: 'TUNNEL-FAILED' })).rejects.toThrow('TUNNEL_START_FAILED');
    expect(old.alive).toBe(false);
    expect(old.stops).toBe(1);
    expect(controller.status.state).toBe('FAILED');
    expect(await controller.start({ mode: 'ONLINE', roomCode: 'TUNNEL-RETRY' })).toMatchObject({ state: 'HOSTING' });
    expect(old.stops).toBe(1);
    expect(next.alive).toBe(true);
    expect(next.stops).toBe(0);
    expect(controller.creationCapability('TUNNEL-FAILED')).toBeUndefined();
    expect(controller.creationCapability('TUNNEL-RETRY')).toMatch(/^[a-f0-9]{64}$/u);
    await controller.stop();
    expect(registry.revoke.mock.calls).toEqual([['TUNNEL-FAILED', 'TUNNEL-FAILED'], ['TUNNEL-RETRY', 'TUNNEL-RETRY']]);
  });

  it('rechecks coalescing after concurrent starts wait behind the same Stop barrier', async () => {
    const ready = deferred<ServerHelperInfo>();
    const old = new OwnedHelper(ready.promise);
    const next = new OwnedHelper();
    const factory = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(next);
    const controller = runtime({ helperFactory: factory });
    const obsolete = observe(controller.start({ roomCode: 'WAIT-OLD' }));
    await old.entered.promise;
    const stopping = controller.stop();
    const first = controller.start({ roomCode: 'WAIT-NEW' });
    const duplicate = controller.start({ roomCode: 'WAIT-NEW' });
    ready.resolve(info);
    await stopping;
    const statuses = await Promise.all([first, duplicate]);
    expectCancelled(await obsolete);
    expect(statuses[0]).toEqual(statuses[1]);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(old.stops).toBe(1);
    expect(next.starts).toBe(1);
    expect(controller.creationCapability('WAIT-NEW')).toMatch(/^[a-f0-9]{64}$/u);
    await controller.stop();
  });

  it('rechecks room ownership after different queued starts cross the same Stop barrier', async () => {
    const ready = deferred<ServerHelperInfo>();
    const old = new OwnedHelper(ready.promise);
    const next = new OwnedHelper();
    const factory = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(next);
    const controller = runtime({ helperFactory: factory });
    const obsolete = observe(controller.start({ roomCode: 'QUEUED-OLD' }));
    await old.entered.promise;
    const stopping = controller.stop();
    const first = controller.start({ roomCode: 'QUEUED-B' });
    const conflicting = observe(controller.start({ roomCode: 'QUEUED-C' }));
    ready.resolve(info);
    await stopping;
    expect(await first).toMatchObject({ state: 'HOSTING' });
    expectCancelled(await obsolete);
    const conflict = await conflicting;
    expect('error' in conflict && conflict.error).toBeInstanceOf(Error);
    expect('error' in conflict && (conflict.error as Error).message).toBe('HOST_ROOM_CONFLICT');
    expect(factory).toHaveBeenCalledTimes(2);
    expect(controller.creationCapability('QUEUED-B')).toMatch(/^[a-f0-9]{64}$/u);
    expect(controller.creationCapability('QUEUED-C')).toBeUndefined();
    await controller.stop();
  });

  it('retains a failed tunnel cleanup barrier and retries without stopping the cleared helper twice', async () => {
    const connected = deferred<string>();
    const old = new OwnedHelper();
    const next = new OwnedHelper();
    const factory = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(next);
    const tunnel = new OwnedTunnel(connected.promise);
    const controller = runtime({ discovery: discovery(), connectivity: tunnel, helperFactory: factory, onlineFetch: publicRoute });
    const obsolete = observe(controller.start({ mode: 'ONLINE', roomCode: 'CLEANUP-OLD' }));
    await tunnel.entered.promise;
    tunnel.stopFailures = 1;
    const stopping = controller.stop();
    connected.resolve('https://cleanup.trycloudflare.com');
    await expect(stopping).rejects.toThrow('tunnel stop failed');
    expectCancelled(await obsolete);
    expect(controller.isBusy).toBe(true);
    expect(controller.status.state).toBe('FAILED');
    expect(controller.status.onlineEndpoint).toBeNull();
    expect(old.alive).toBe(false);
    expect(tunnel.alive).toBe(true);
    await controller.stop();
    expect(controller.status.state).toBe('IDLE');
    expect(controller.isBusy).toBe(false);
    expect(old.stops).toBe(1);
    expect(tunnel.stops).toBe(2);
    expect(tunnel.alive).toBe(false);
    expect(await controller.start({ roomCode: 'CLEANUP-NEW' })).toMatchObject({ state: 'HOSTING' });
    expect(old.stops).toBe(1);
    expect(next.alive).toBe(true);
    expect(controller.creationCapability('CLEANUP-NEW')).toMatch(/^[a-f0-9]{64}$/u);
    await controller.stop();
  });

  it('retains helper ownership when Stop rejects with undefined and allows cleanup retry', async () => {
    const helper = new OwnedHelper();
    const controller = runtime({ helperFactory: () => helper });
    await controller.start({ roomCode: 'HELPER-FALSY-STOP' });
    const stop = vi.spyOn(helper, 'stop').mockRejectedValueOnce(undefined);
    const outcome = await controller.stop().then(() => 'resolved', () => 'rejected');
    expect(outcome).toBe('rejected');
    expect(controller.status.state).toBe('FAILED');
    expect(controller.isBusy).toBe(true);
    expect(helper.alive).toBe(true);
    expect(controller.creationCapability('HELPER-FALSY-STOP')).toBeUndefined();
    await expect(controller.stop()).resolves.toMatchObject({ state: 'IDLE' });
    expect(stop).toHaveBeenCalledTimes(2);
    expect(helper.alive).toBe(false);
    expect(controller.isBusy).toBe(false);
  });

  it('retains tunnel ownership when Stop rejects with undefined and retries without resurrecting the helper', async () => {
    const helper = new OwnedHelper();
    const tunnel = new OwnedTunnel();
    const controller = runtime({ discovery: discovery(), connectivity: tunnel, helperFactory: () => helper, onlineFetch: publicRoute });
    await controller.start({ mode: 'ONLINE', roomCode: 'TUNNEL-FALSY-STOP' });
    const stop = vi.spyOn(tunnel, 'stop').mockRejectedValueOnce(undefined);
    const outcome = await controller.stop().then(() => 'resolved', () => 'rejected');
    expect(outcome).toBe('rejected');
    expect(controller.status.state).toBe('FAILED');
    expect(controller.status.onlineEndpoint).toBeNull();
    expect(controller.isBusy).toBe(true);
    expect(tunnel.alive).toBe(true);
    expect(helper.alive).toBe(false);
    expect(helper.stops).toBe(1);
    await expect(controller.stop()).resolves.toMatchObject({ state: 'IDLE' });
    expect(stop).toHaveBeenCalledTimes(2);
    expect(tunnel.alive).toBe(false);
    expect(helper.stops).toBe(1);
    expect(controller.isBusy).toBe(false);
  });

});
