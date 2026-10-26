import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppQuitCoordinator } from '../src/appQuitCoordinator';
import type { UpdateService, UpdateServiceOptions } from '../src/update/updateService';
import { HostRuntimeController, type HostRuntimeStatus } from '../src/hostRuntime';
import type { ConnectivityProvider } from '../src/online/connectivity';
import type { OnlineFetcher } from '../src/online/probe';

const shell = vi.hoisted(() => ({
  events: new Map<string, (...args: unknown[]) => void>(),
  coordinator: undefined as AppQuitCoordinator | undefined,
  updater: undefined as UpdateService | undefined,
  ready: undefined as (() => void) | undefined,
  quit: vi.fn(),
  install: vi.fn(() => Promise.resolve({ ok: true as const, quit: false })),
}));
vi.mock('electron', () => ({
  utilityProcess: { fork: vi.fn() },
  app: { isPackaged: false, getVersion: () => '1.10.0', getPath: () => path.resolve('e1-mocked-temp'),
    whenReady: () => Promise.resolve(), quit: shell.quit,
    on: (name: string, listener: (...args: unknown[]) => void) => shell.events.set(name, listener) },
  BrowserWindow: class {
    static getAllWindows() { return []; }
    webContents = { on: vi.fn() };
    on = vi.fn();
    loadURL = vi.fn(() => Promise.resolve());
  },
  net: { fetch: vi.fn(() => Promise.resolve(new Response(JSON.stringify({
    schemaVersion: 1, app: 'own-the-block', version: '1.11.0', minimumSupportedVersion: '1.0.0',
    assets: { 'win32-x64': { name: 'OwnTheBlock-1.11.0-win32-x64-Setup.exe', size: 1_052_672, sha256: 'a'.repeat(64) } },
  })))) },
  session: { defaultSession: {} },
  shell: { openPath: vi.fn() },
  protocol: { registerSchemesAsPrivileged: vi.fn() },
  powerMonitor: { on: vi.fn() },
}));
vi.mock('../src/ipc/windowHandlers', () => ({
  registerWindowHandlers: vi.fn(),
  QuitRequestController: class { armNextClose = vi.fn(); requestApplicationQuit = () => Promise.resolve(true); },
}));
vi.mock('../src/ipc/externalLinks', () => ({ installExternalNavigationGuards: vi.fn() }));
vi.mock('../src/lanFinder', () => ({ LanFinder: class {} }));
vi.mock('../src/update/installers', () => ({ selectInstaller: () => ({ mode: 'restart', payload: 'installer', install: shell.install }) }));
vi.mock('../src/update/updateConfig', async importOriginal => ({
  ...await importOriginal<typeof import('../src/update/updateConfig')>(),
  resolveUpdateEndpoints: () => ({ manifestUrl: 'https://updates.invalid/manifest.json',
    assetUrl: () => 'https://updates.invalid/Setup.exe', isUrlAllowed: () => true }),
}));
vi.mock('../src/update/stagedFiles', async importOriginal => ({
  ...await importOriginal<typeof import('../src/update/stagedFiles')>(),
  pruneStagedUpdates: () => Promise.resolve(), unverifiedFiles: () => Promise.resolve([]),
}));
vi.mock('../src/appQuitCoordinator', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/appQuitCoordinator')>();
  return { AppQuitCoordinator: class extends actual.AppQuitCoordinator {
    constructor(options: ConstructorParameters<typeof actual.AppQuitCoordinator>[0]) {
      super(options); shell.coordinator = this;
    }
  } };
});
vi.mock('../src/update/updateService', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/update/updateService')>();
  return { UpdateService: class extends actual.UpdateService {
    constructor(options: UpdateServiceOptions) {
      // Fixed platform chooses the local manifest fixture on every execution host.
      super({ ...options, platform: 'win32', architecture: 'x64' }); shell.updater = this;
    }
    override start() { shell.ready?.(); }
  } };
});


/** Default-suite fixture: real HostRuntimeController, local adapters and explicit stage barriers only. */
function runtimeFixture() {
  const releases: Array<() => void> = [];
  const pending: Promise<unknown>[] = [];
  const statuses: HostRuntimeStatus[] = [];
  let liveHelpers = 0;
  let liveTunnels = 0;
  const info = { host: '0.0.0.0', port: 43123, pid: 701 };
  const helperReady = vi.fn(() => Promise.resolve(info));
  const helperClose = vi.fn(() => Promise.resolve());
  const tunnelReady = vi.fn(() => Promise.resolve('https://startup-bootstrap.trycloudflare.com'));
  const helpers: ReturnType<typeof makeHelper>[] = [];
  const makeHelper = () => ({
    state: 'READY' as const,
    diagnostic: '',
    start: vi.fn(async () => { const result = await helperReady(); liveHelpers += 1; return result; }),
    stop: vi.fn(async () => { await helperClose(); liveHelpers = 0; }),
    setPublicEndpoints: vi.fn(),
  });
  const helperFactory = vi.fn(() => { const helper = makeHelper(); helpers.push(helper); return helper; });
  const connectivity = {
    start: vi.fn<ConnectivityProvider['start']>(async () => {
      const endpoint = await tunnelReady(); liveTunnels += 1; return endpoint;
    }),
    stop: vi.fn(async () => { liveTunnels = 0; }),
  };
  const discovery = {
    reserve: vi.fn((code: string) => Promise.resolve({ credential: 'credential-' + code, proof: 'proof-' + code })),
    activate: vi.fn(() => Promise.resolve()), renew: vi.fn(() => Promise.resolve()),
    suspend: vi.fn(() => Promise.resolve()), revoke: vi.fn(() => Promise.resolve()),
    resolve: vi.fn(() => Promise.resolve(null)),
  };
  const routeProbe = vi.fn((): Promise<string | undefined> => Promise.resolve(undefined));
  const onlineFetch = vi.fn<OnlineFetcher>((url) => Promise.resolve(new Response(
    url.endsWith('/readyz') ? 'ready' : '<html>Own the Block</html>', { status: 200 },
  )));
  const host = new HostRuntimeController({
    helperPath: path.resolve('bootstrap-mocked-helper.cjs'), clientDist: path.resolve('bootstrap-mocked-client'),
    appVersion: '1.10.0', defaultPort: 43123, healthCheckIntervalMs: 0,
    interfaceProvider: () => [{ name: 'Wi-Fi', displayName: 'Wi-Fi', address: '192.168.1.15',
      netmask: '255.255.255.0', preference: 'preferred', rank: 0 }],
    helperFactory, connectivity, discovery, routeProbe, onlineFetch,
  });
  const removeListener = host.onStatusChanged(status => statuses.push(status));
  function deferred<T>(fallback: T) {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    void promise.catch(() => undefined);
    releases.push(() => resolve(fallback));
    return { promise, resolve, reject };
  }
  function track<T>(promise: Promise<T>): Promise<T> {
    pending.push(promise); void promise.catch(() => undefined); return promise;
  }
  async function cleanup() {
    try {
      releases.forEach(release => release());
      await Promise.allSettled(pending);
      await host.stop();
    } finally { removeListener(); }
  }
  return { host, helpers, helperFactory, helperReady, helperClose, tunnelReady, connectivity, discovery,
    routeProbe, onlineFetch, statuses, deferred, track, cleanup, info,
    resources: () => ({ helpers: liveHelpers, tunnels: liveTunnels }) };
}

beforeEach(() => {
  vi.useFakeTimers(); shell.events.clear(); shell.quit.mockClear(); shell.install.mockClear();
});
afterEach(() => {
  try { shell.updater?.dispose(); } finally {
    shell.updater = undefined; shell.coordinator = undefined; shell.ready = undefined;
    vi.doUnmock('../src/hostRuntime');
    vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers();
  }
});

/** Exercise actual bootstrap wiring; native windows, update files and installer I/O never run. */
async function bootstrap(f: ReturnType<typeof runtimeFixture>) {
  vi.resetModules();
  vi.doMock('../src/hostRuntime', () => ({ HostRuntimeController: class { constructor() { return f.host; } } }));
  const ready = new Promise<void>(resolve => { shell.ready = resolve; });
  const { startDesktopRuntime } = await import('../src/desktopBootstrap.js');
  startDesktopRuntime(); await ready;
}

function requestQuit() {
  const event = { preventDefault: vi.fn() };
  const beforeQuit = shell.events.get('before-quit');
  expect(beforeQuit).toBeTypeOf('function');
  beforeQuit!(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
}

async function readyUpdater() {
  expect((await shell.updater!.checkForUpdates('manual')).phase).toBe('ready');
}

async function expectInstallationBlocked() {
  expect((await shell.updater!.installUpdate()).installBlocked).toBe('HOST_OPEN');
  expect(shell.install).not.toHaveBeenCalled();
  expect(shell.quit).not.toHaveBeenCalled();
}

describe('Host startup bootstrap lifecycle', () => {
  it('waits for helper acquisition before authorizing a coalesced application quit and cleans the late helper once', async () => {
    const f = runtimeFixture();
    const ready = f.deferred(f.info);
    const entered = f.deferred(undefined);
    f.helperReady.mockImplementationOnce(() => { entered.resolve(undefined); return ready.promise; });
    try {
      await bootstrap(f);
      const starting = f.track(f.host.start({ mode: 'ONLINE', roomCode: 'HELPER-QUIT' }));
      await entered.promise;
      requestQuit(); requestQuit();
      await vi.advanceTimersByTimeAsync(0);
      expect(f.host.status.state).toBe('STOPPING');
      expect(shell.quit).not.toHaveBeenCalled();
      expect(f.connectivity.start).not.toHaveBeenCalled();
      ready.resolve(f.info);
      await Promise.allSettled([starting, shell.coordinator!.waitForSettled()]);
      expect(f.helpers[0].stop).toHaveBeenCalledOnce();
      expect(f.connectivity.start).not.toHaveBeenCalled();
      expect(f.resources()).toEqual({ helpers: 0, tunnels: 0 });
      expect(f.host.status.state).toBe('IDLE');
      expect(f.host.creationCapability('HELPER-QUIT')).toBeUndefined();
      expect(shell.quit).toHaveBeenCalledOnce();
      const finalEvent = { preventDefault: vi.fn() };
      shell.events.get('before-quit')!(finalEvent);
      expect(finalEvent.preventDefault).not.toHaveBeenCalled();
      expect(shell.quit).toHaveBeenCalledOnce();
    } finally { await f.cleanup(); }
  });

  it('waits for an in-flight tunnel before quitting and cannot publish its late endpoint', async () => {
    const f = runtimeFixture();
    const tunnel = f.deferred('https://startup-bootstrap.trycloudflare.com');
    const entered = f.deferred(undefined);
    f.tunnelReady.mockImplementationOnce(() => { entered.resolve(undefined); return tunnel.promise; });
    try {
      await bootstrap(f);
      const starting = f.track(f.host.start({ mode: 'ONLINE', roomCode: 'TUNNEL-QUIT' }));
      await entered.promise;
      requestQuit(); requestQuit();
      await vi.advanceTimersByTimeAsync(0);
      expect(shell.quit).not.toHaveBeenCalled();
      expect(f.host.status.state).toBe('STOPPING');
      tunnel.resolve('https://startup-bootstrap.trycloudflare.com');
      await Promise.allSettled([starting, shell.coordinator!.waitForSettled()]);
      expect(f.connectivity.start).toHaveBeenCalledOnce();
      expect(f.connectivity.stop).toHaveBeenCalledOnce();
      expect(f.helpers[0].stop).toHaveBeenCalledOnce();
      expect(f.resources()).toEqual({ helpers: 0, tunnels: 0 });
      expect(f.host.status).toMatchObject({ state: 'IDLE', onlineEndpoint: null });
      expect(f.statuses.some(status => status.state === 'HOSTING')).toBe(false);
      expect(shell.quit).toHaveBeenCalledOnce();
    } finally { await f.cleanup(); }
  });

  it('cancels startup during the public-page body await and ignores its completion after shutdown', async () => {
    const f = runtimeFixture();
    const body = f.deferred<ReadableStreamReadResult<Uint8Array<ArrayBuffer>>>({ done: false,
      value: new TextEncoder().encode('<html>Own the Block</html>') });
    const entered = f.deferred(undefined);
    const response = new Response('<html>Own the Block</html>');
    const read = vi.fn(() => { entered.resolve(undefined); return body.promise; });
    const cancel = vi.fn(() => Promise.resolve());
    vi.spyOn(response.body!, 'getReader').mockReturnValue({ read, cancel } as unknown as ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>);
    f.onlineFetch.mockImplementation((url) => Promise.resolve(url.endsWith('/readyz') ? new Response('ready') : response));
    try {
      await bootstrap(f);
      const starting = f.track(f.host.start({ mode: 'ONLINE', roomCode: 'PROBE-QUIT' }));
      await entered.promise;
      requestQuit(); requestQuit();
      await Promise.allSettled([starting, shell.coordinator!.waitForSettled()]);
      const statusesAtQuit = f.statuses.length;
      expect(cancel).toHaveBeenCalledOnce();
      expect(f.resources()).toEqual({ helpers: 0, tunnels: 0 });
      expect(shell.quit).toHaveBeenCalledOnce();
      body.resolve({ done: false, value: new TextEncoder().encode('<html>Own the Block</html>') });
      await vi.advanceTimersByTimeAsync(0);
      expect(f.host.status).toMatchObject({ state: 'IDLE', onlineEndpoint: null });
      expect(f.statuses).toHaveLength(statusesAtQuit);
      expect(f.statuses.some(status => status.state === 'HOSTING')).toBe(false);
    } finally { await f.cleanup(); }
  });

  it('publishes a synchronous busy status to updater listeners as soon as a LAN start is accepted', async () => {
    const f = runtimeFixture();
    const route = f.deferred<string | undefined>('192.168.1.15');
    f.routeProbe.mockImplementationOnce(() => route.promise);
    try {
      await bootstrap(f); await readyUpdater();
      const updates: ReturnType<UpdateService['getState']>[] = [];
      const remove = shell.updater!.onStateChanged(state => updates.push(state));
      try {
        const starting = f.track(f.host.start({ mode: 'LAN', roomCode: 'SYNC-UPDATE' }));
        expect(f.host.status.state).toBe('STARTING_SERVER');
        expect(shell.updater!.getState().installBlocked).toBe('HOST_OPEN');
        expect(updates.at(-1)?.installBlocked).toBe('HOST_OPEN');
        await expectInstallationBlocked();
        const stopping = f.track(f.host.stop());
        route.resolve('192.168.1.15');
        await Promise.allSettled([starting, stopping]);
        expect(f.helperFactory).not.toHaveBeenCalled();
        expect(shell.updater!.getState().installBlocked).toBeUndefined();
      } finally { remove(); }
    } finally { await f.cleanup(); }
  });

  it('blocks the real updater during pending LAN route discovery and unblocks after cancellation', async () => {
    const f = runtimeFixture();
    const route = f.deferred<string | undefined>('192.168.1.15');
    const entered = f.deferred(undefined);
    f.routeProbe.mockImplementationOnce(() => { entered.resolve(undefined); return route.promise; });
    try {
      await bootstrap(f); await readyUpdater();
      const starting = f.track(f.host.start({ mode: 'LAN', roomCode: 'ROUTE-UPDATE' }));
      await entered.promise;
      await expectInstallationBlocked();
      const stopping = f.track(f.host.stop());
      await expectInstallationBlocked();
      route.resolve('192.168.1.15');
      await Promise.allSettled([starting, stopping]);
      expect(f.helperFactory).not.toHaveBeenCalled();
      expect(shell.updater!.getState().installBlocked).toBeUndefined();
      expect(shell.install).not.toHaveBeenCalled();
    } finally { await f.cleanup(); }
  });

  it('blocks the real updater while helper startup is pending', async () => {
    const f = runtimeFixture();
    const ready = f.deferred(f.info);
    const entered = f.deferred(undefined);
    f.helperReady.mockImplementationOnce(() => { entered.resolve(undefined); return ready.promise; });
    try {
      await bootstrap(f); await readyUpdater();
      const starting = f.track(f.host.start({ mode: 'LAN', roomCode: 'HELPER-UPDATE' }));
      await entered.promise;
      await expectInstallationBlocked();
      const stopping = f.track(f.host.stop());
      ready.resolve(f.info);
      await Promise.allSettled([starting, stopping]);
      expect(f.resources()).toEqual({ helpers: 0, tunnels: 0 });
      expect(shell.updater!.getState().installBlocked).toBeUndefined();
    } finally { await f.cleanup(); }
  });

  it('blocks the real updater while Online tunnel startup is pending', async () => {
    const f = runtimeFixture();
    const tunnel = f.deferred('https://startup-bootstrap.trycloudflare.com');
    const entered = f.deferred(undefined);
    f.tunnelReady.mockImplementationOnce(() => { entered.resolve(undefined); return tunnel.promise; });
    try {
      await bootstrap(f); await readyUpdater();
      const starting = f.track(f.host.start({ mode: 'ONLINE', roomCode: 'TUNNEL-UPDATE' }));
      await entered.promise;
      await expectInstallationBlocked();
      const stopping = f.track(f.host.stop());
      tunnel.resolve('https://startup-bootstrap.trycloudflare.com');
      await Promise.allSettled([starting, stopping]);
      expect(f.resources()).toEqual({ helpers: 0, tunnels: 0 });
      expect(shell.updater!.getState().installBlocked).toBeUndefined();
      expect(f.statuses.some(status => status.state === 'HOSTING')).toBe(false);
    } finally { await f.cleanup(); }
  });

  it('keeps the updater blocked until actual helper shutdown completes', async () => {
    const f = runtimeFixture();
    const closed = f.deferred(undefined);
    const entered = f.deferred(undefined);
    f.helperClose.mockImplementationOnce(() => { entered.resolve(undefined); return closed.promise; });
    try {
      await bootstrap(f); await readyUpdater();
      await f.host.start({ mode: 'LAN', roomCode: 'STOPPING-UPDATE' });
      const stopping = f.track(f.host.stop());
      await entered.promise;
      expect(f.host.status.state).toBe('STOPPING');
      expect(f.resources().helpers).toBe(1);
      await expectInstallationBlocked();
      closed.resolve(undefined); await stopping;
      expect(f.resources()).toEqual({ helpers: 0, tunnels: 0 });
      expect(f.host.status.state).toBe('IDLE');
      expect(shell.updater!.getState().installBlocked).toBeUndefined();
      expect(shell.install).not.toHaveBeenCalled();
    } finally { await f.cleanup(); }
  });
});
