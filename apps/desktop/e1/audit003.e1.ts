import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppQuitCoordinator } from '../src/appQuitCoordinator';
import type { UpdateService, UpdateServiceOptions } from '../src/update/updateService';
import { isCorrectnessRegression } from './phaseE1Mode';
import { lifecycleFixture } from './lifecycleFixture';

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

const correctness = isCorrectnessRegression();
const category = correctness ? 'correctness regression' : 'post-fix characterization';
beforeEach(() => {
  vi.useFakeTimers(); shell.events.clear(); shell.quit.mockClear(); shell.install.mockClear();
});
afterEach(() => {
  try {
    shell.updater?.dispose();
  } finally {
    shell.updater = undefined; shell.coordinator = undefined; shell.ready = undefined;
    vi.doUnmock('../src/hostRuntime');
    vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers();
  }
});

/** Import the real bootstrap wiring with only OS/window/native side effects replaced. */
async function bootstrap(f: ReturnType<typeof lifecycleFixture>) {
  vi.resetModules();
  vi.doMock('../src/hostRuntime', () => ({ HostRuntimeController: class { constructor() { return f.host; } } }));
  const ready = new Promise<void>(resolve => { shell.ready = resolve; });
  const { startDesktopRuntime } = await import('../src/desktopBootstrap.js');
  startDesktopRuntime();
  await ready;
}

describe('AUDIT-003 ' + category, () => {
  it('003-A pending LAN route must not start a helper after stop', async () => {
    const f = lifecycleFixture();
    const route = f.deferred<string | undefined>('192.168.1.15');
    const entered = f.deferred(undefined);
    f.routeProbe.mockImplementationOnce(() => { entered.resolve(undefined); return route.promise; });
    const host = f.host;
    try {
      const starting = f.track(host.start({ mode: 'LAN', roomCode: 'ROOM-A' }));
      await entered.promise;
      let stopped = false;
      const stopping = f.track(host.stop().then(() => { stopped = true; }));
      await vi.advanceTimersByTimeAsync(0);
      expect({ state: host.status.state, stopped }).toEqual({ state: 'STOPPING', stopped: false });
      expect(f.helperFactory).not.toHaveBeenCalled();
      route.resolve('192.168.1.15');
      await Promise.allSettled([starting, stopping]);
      expect({ starts: f.helpers.reduce((n, helper) => n + helper.start.mock.calls.length, 0), state: host.status.state })
        .toEqual({ starts: 0, state: 'IDLE' });
      expect(f.connectivity.start).not.toHaveBeenCalled();
    } finally { route.resolve('192.168.1.15'); await f.cleanup(); }
  });

  it('003-B pending Online reservation must not start a helper or tunnel after stop', async () => {
    const f = lifecycleFixture();
    const reserve = f.deferred({ credential: 'credential-ROOM-A', proof: 'proof-ROOM-A' });
    const entered = f.deferred(undefined);
    f.discovery.reserve.mockImplementationOnce(() => { entered.resolve(undefined); return reserve.promise; });
    try {
      const starting = f.track(f.host.start({ mode: 'ONLINE', roomCode: 'ROOM-A' }));
      await entered.promise;
      let stopped = false;
      const stopping = f.track(f.host.stop().then(() => { stopped = true; }));
      await vi.advanceTimersByTimeAsync(0);
      expect({ state: f.host.status.state, stopped }).toEqual({ state: 'STOPPING', stopped: false });
      expect(f.helperFactory).not.toHaveBeenCalled();
      expect(f.connectivity.start).not.toHaveBeenCalled();
      reserve.resolve({ credential: 'credential-ROOM-A', proof: 'proof-ROOM-A' });
      await Promise.allSettled([starting, stopping]);
      const observed = { helpers: f.helperFactory.mock.calls.length, tunnels: f.connectivity.start.mock.calls.length,
        state: f.host.status.state, endpoint: f.host.status.onlineEndpoint };
      expect(observed).toEqual({ helpers: 0, tunnels: 0, state: 'IDLE', endpoint: null });
    } finally { await f.cleanup(); }
  });

  it('003-C bootstrap quit must not authorize exit while a pending startup can launch later', async () => {
    const f = lifecycleFixture();
    const reserve = f.deferred({ credential: 'credential-ROOM-A', proof: 'proof-ROOM-A' });
    const entered = f.deferred(undefined);
    f.discovery.reserve.mockImplementationOnce(() => { entered.resolve(undefined); return reserve.promise; });
    try {
      await bootstrap(f);
      const starting = f.track(f.host.start({ mode: 'ONLINE', roomCode: 'ROOM-A' }));
      await entered.promise;
      const preventDefault = vi.fn();
      shell.events.get('before-quit')?.({ preventDefault });
      await vi.advanceTimersByTimeAsync(0);
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(shell.quit).not.toHaveBeenCalled();
      expect(f.helperFactory).not.toHaveBeenCalled();
      reserve.resolve({ credential: 'credential-ROOM-A', proof: 'proof-ROOM-A' });
      await Promise.allSettled([starting, shell.coordinator!.waitForSettled()]);
      expect({ helpers: f.helperFactory.mock.calls.length, tunnels: f.connectivity.start.mock.calls.length, state: f.host.status.state })
        .toEqual({ helpers: 0, tunnels: 0, state: 'IDLE' });
      expect(shell.quit).toHaveBeenCalledOnce();
    } finally { await f.cleanup(); }
  });

  it('003-D real updater safety must block installation during bootstrap pending startup', async () => {
    const f = lifecycleFixture();
    const reserve = f.deferred({ credential: 'credential-ROOM-A', proof: 'proof-ROOM-A' });
    const entered = f.deferred(undefined);
    f.discovery.reserve.mockImplementationOnce(() => { entered.resolve(undefined); return reserve.promise; });
    try {
      await bootstrap(f);
      expect((await shell.updater!.checkForUpdates('manual')).phase).toBe('ready');
      const starting = f.track(f.host.start({ mode: 'ONLINE', roomCode: 'ROOM-A' }));
      await entered.promise;
      const state = await shell.updater!.installUpdate();
      expect({ blocked: state.installBlocked, installs: shell.install.mock.calls.length })
        .toEqual({ blocked: 'HOST_OPEN', installs: 0 });
      expect(f.helperFactory).not.toHaveBeenCalled();
      reserve.resolve({ credential: 'credential-ROOM-A', proof: 'proof-ROOM-A' });
      await starting;
    } finally { await f.cleanup(); }
  });

  it('003-E start-stop-start must activate only the newly requested room', async () => {
    const f = lifecycleFixture();
    const reserve = f.deferred({ credential: 'credential-ROOM-A', proof: 'proof-ROOM-A' });
    const entered = f.deferred(undefined);
    f.discovery.reserve.mockImplementationOnce(() => { entered.resolve(undefined); return reserve.promise; });
    try {
      const first = f.track(f.host.start({ mode: 'ONLINE', roomCode: 'ROOM-A' }));
      await entered.promise;
      const stopping = f.track(f.host.stop());
      await vi.advanceTimersByTimeAsync(0);
      const second = f.track(f.host.start({ mode: 'ONLINE', roomCode: 'ROOM-B' }));
      reserve.resolve({ credential: 'credential-ROOM-A', proof: 'proof-ROOM-A' });
      await Promise.allSettled([first, stopping, second]);
      const ownership = { old: Boolean(f.host.creationCapability('ROOM-A')), current: Boolean(f.host.creationCapability('ROOM-B')) };
      expect(ownership).toEqual({ old: false, current: true });
      expect(f.helperFactory).toHaveBeenCalledOnce();
      expect(f.helpers[0].start).toHaveBeenCalledOnce();
      expect(f.connectivity.start).toHaveBeenCalledOnce();
      expect(f.host.status.state).toBe('HOSTING');
    } finally { await f.cleanup(); }
  });

  it('003-E control: concurrent starts for the same room coalesce one helper and tunnel', async () => {
    const f = lifecycleFixture();
    const reserve = f.deferred({ credential: 'credential-ROOM-A', proof: 'proof-ROOM-A' });
    f.discovery.reserve.mockImplementationOnce(() => reserve.promise);
    try {
      const first = f.track(f.host.start({ mode: 'ONLINE', roomCode: 'ROOM-A' }));
      const second = f.track(f.host.start({ mode: 'ONLINE', roomCode: 'ROOM-A' }));
      reserve.resolve({ credential: 'credential-ROOM-A', proof: 'proof-ROOM-A' });
      const results = await Promise.all([first, second]);
      expect(results[0]).toEqual(results[1]);
      expect(f.discovery.reserve).toHaveBeenCalledOnce();
      expect(f.helpers[0].start).toHaveBeenCalledOnce();
      expect(f.connectivity.start).toHaveBeenCalledOnce();
      expect(f.host.creationCapability('ROOM-A')).toMatch(/^[a-f0-9]{64}$/u);
    } finally { await f.cleanup(); }
  });
});
