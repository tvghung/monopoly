import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstallOutcome, UpdateInstaller } from '../src/update/installers';
import { MIN_ASSET_BYTES } from '../src/update/manifest';
import { productionEndpoints, releaseAssetUrl } from '../src/update/updateConfig';
import { UpdateService, type UpdateServiceOptions } from '../src/update/updateService';
import type { AppUpdateState } from '../src/update/updateTypes';

// These tests write and hash a real installer-sized file and wait on real timers. A slow or busy machine (a CI runner, or this
// one under load) must not turn "late" into "failed": a test that is quick when the machine is quick costs nothing extra.
vi.setConfig({ testTimeout: 30_000 });
const waitFor = <T>(check: () => T | Promise<T>) => vi.waitFor(check, { timeout: 15_000, interval: 25 });

const endpoints = productionEndpoints();
const INSTALLER = randomBytes(MIN_ASSET_BYTES + 4_096);
const INSTALLER_SHA = createHash('sha256').update(INSTALLER).digest('hex');
const ASSET_NAME = 'OwnTheBlock-1.2.0-win32-x64-Setup.exe';

interface ManifestOptions {
  version?: string;
  minimumSupportedVersion?: string;
  assets?: Record<string, unknown>;
  app?: string;
}

function manifestJson(options: ManifestOptions = {}): string {
  const version = options.version ?? '1.2.0';
  return JSON.stringify({
    schemaVersion: 1,
    app: options.app ?? 'own-the-block',
    version,
    minimumSupportedVersion: options.minimumSupportedVersion ?? '1.0.0',
    assets: options.assets ?? {
      'win32-x64': { name: `OwnTheBlock-${version}-win32-x64-Setup.exe`, size: INSTALLER.length, sha256: INSTALLER_SHA },
    },
  });
}

/** A body that arrives in slices, optionally stalls after some bytes until the request is aborted (as a real fetch does). */
function slicedBody(bytes: Buffer, signal: AbortSignal | null | undefined, options: { slice?: number; hangAfter?: number } = {}) {
  const slice = options.slice ?? 256 * 1024;
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (options.hangAfter !== undefined && offset >= options.hangAfter) {
        return new Promise<void>((_resolve, reject) => {
          const fail = () => reject(new DOMException('Aborted', 'AbortError'));
          if (signal?.aborted) fail();
          else signal?.addEventListener('abort', fail, { once: true });
        });
      }
      if (offset >= bytes.length) {
        controller.close();
        return undefined;
      }
      controller.enqueue(new Uint8Array(bytes.subarray(offset, offset + slice)));
      offset += slice;
      return undefined;
    },
  });
}

type Route = (init: RequestInit | undefined) => Response | Promise<Response>;

interface Harness {
  service: UpdateService;
  states: AppUpdateState[];
  fetchUrls: string[];
  routes: Map<string, Route>;
  installer: { mode: UpdateInstaller['mode']; install: ReturnType<typeof vi.fn> };
  requestQuit: ReturnType<typeof vi.fn>;
  host: { busy: boolean };
  updatesDirectory: string;
  stagedPath(version?: string, name?: string): string;
  serveManifest(text: string): void;
  serveInstaller(version?: string, bytes?: Buffer): void;
}

let workspace: string;
const services: UpdateService[] = [];

beforeEach(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-update-service-'));
});

afterEach(async () => {
  for (const service of services.splice(0)) service.dispose();
  await rm(workspace, { recursive: true, force: true });
});

function harness(overrides: Partial<UpdateServiceOptions> & {
  installOutcome?: InstallOutcome;
  installerMode?: UpdateInstaller['mode'];
} = {}): Harness {
  const { installOutcome, installerMode = 'restart', ...serviceOverrides } = overrides;
  const updatesDirectory = path.join(workspace, 'updates');
  const routes = new Map<string, Route>();
  const fetchUrls: string[] = [];
  const states: AppUpdateState[] = [];
  const host = { busy: false };
  const requestQuit = vi.fn();
  const installer = {
    mode: installerMode,
    install: vi.fn(() => Promise.resolve(installOutcome ?? { ok: true as const, quit: installerMode === 'restart' })),
  };
  const fakeFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    fetchUrls.push(url);
    const route = routes.get(url);
    if (!route) return Promise.reject(new TypeError('fetch failed'));
    return Promise.resolve(route(init));
  }) as typeof globalThis.fetch;

  const service = new UpdateService({
    currentVersion: '1.1.1',
    platform: 'win32',
    architecture: 'x64',
    endpoints,
    installer: installer as unknown as UpdateInstaller,
    updatesDirectory,
    fetch: fakeFetch,
    isHostBusy: () => host.busy,
    requestQuit,
    freeDiskBytes: () => Promise.resolve(undefined),
    log: () => undefined,
    timing: { manifestTimeoutMs: 2_000, progressIntervalMs: 0, ...serviceOverrides.timing },
    ...serviceOverrides,
  });
  services.push(service);
  service.onStateChanged(state => states.push(state));

  const result: Harness = {
    service,
    states,
    fetchUrls,
    routes,
    installer,
    requestQuit,
    host,
    updatesDirectory,
    stagedPath: (version = '1.2.0', name = ASSET_NAME) => path.join(updatesDirectory, version, name),
    serveManifest: text => {
      routes.set(endpoints.manifestUrl, () => new Response(text, { status: 200 }));
    },
    serveInstaller: (version = '1.2.0', bytes = INSTALLER) => {
      routes.set(releaseAssetUrl(version, `OwnTheBlock-${version}-win32-x64-Setup.exe`), init => new Response(
        slicedBody(bytes, init?.signal),
        { status: 200, headers: { 'content-length': String(bytes.length) } },
      ));
    },
  };
  return result;
}

const phases = (states: AppUpdateState[]) => states.map(state => state.phase);

describe('without an update channel', () => {
  it('is unsupported and never touches the network', async () => {
    const h = harness({ endpoints: undefined });
    h.serveManifest(manifestJson());

    expect(h.service.getState()).toMatchObject({ phase: 'unsupported', currentVersion: '1.1.1' });
    expect((await h.service.checkForUpdates('manual')).phase).toBe('unsupported');
    expect((await h.service.downloadUpdate()).phase).toBe('unsupported');
    expect((await h.service.installUpdate()).phase).toBe('unsupported');
    h.service.start();
    expect(h.fetchUrls).toEqual([]);
  });

  it('is unsupported when it has no installer for the platform or an unreadable running version', () => {
    expect(harness({ installer: undefined }).service.getState().phase).toBe('unsupported');
    expect(harness({ currentVersion: 'dev' }).service.getState().phase).toBe('unsupported');
  });
});

describe('checking for updates', () => {
  it('starts idle, with the running version and what applying an update will do', () => {
    expect(harness().service.getState()).toEqual({ phase: 'idle', currentVersion: '1.1.1', installMode: 'restart' });
    expect(harness({ installerMode: 'open-installer' }).service.getState().installMode).toBe('open-installer');
  });

  it('says nothing is new when the newest release is the running version, or older', async () => {
    const h = harness({ now: () => 1_000 });
    h.serveManifest(manifestJson({ version: '1.1.1' }));

    const state = await h.service.checkForUpdates('manual');

    expect(state).toEqual({ phase: 'up-to-date', currentVersion: '1.1.1', installMode: 'restart', checkedAt: 1_000 });
    expect(phases(h.states)).toEqual(['checking', 'up-to-date']);

    h.serveManifest(manifestJson({ version: '1.0.0' }));
    expect((await h.service.checkForUpdates('manual')).phase).toBe('up-to-date');
  });

  it('offers a newer release with its version and size, and does not start downloading it', async () => {
    const h = harness();
    h.serveManifest(manifestJson());

    const state = await h.service.checkForUpdates('startup');

    expect(state.phase).toBe('available');
    expect(state.update).toEqual({ version: '1.2.0', mandatory: false, sizeBytes: INSTALLER.length });
    expect(h.fetchUrls).toEqual([endpoints.manifestUrl]);
  });

  it('marks the update mandatory only when the running version is below the minimum supported version', async () => {
    const h = harness();
    h.serveManifest(manifestJson({ version: '1.3.0', minimumSupportedVersion: '1.2.0' }));
    expect((await h.service.checkForUpdates('manual')).update?.mandatory).toBe(true);

    const tolerant = harness();
    tolerant.serveManifest(manifestJson({ version: '1.3.0', minimumSupportedVersion: '1.1.0' }));
    expect((await tolerant.service.checkForUpdates('manual')).update?.mandatory).toBe(false);
  });

  it('shares one request between checks that overlap', async () => {
    const h = harness();
    h.serveManifest(manifestJson());

    const [first, second] = await Promise.all([h.service.checkForUpdates('startup'), h.service.checkForUpdates('manual')]);

    expect(first).toEqual(second);
    expect(h.fetchUrls).toEqual([endpoints.manifestUrl]);
  });

  it('does not look again while an update is known: the player is dealing with it', async () => {
    const h = harness();
    h.serveManifest(manifestJson());
    await h.service.checkForUpdates('startup');
    h.fetchUrls.length = 0;

    expect((await h.service.checkForUpdates('manual')).phase).toBe('available');
    expect(h.fetchUrls).toEqual([]);
  });

  it.each([
    ['no Internet', () => Promise.reject(new TypeError('fetch failed')), 'OFFLINE'],
    ['a missing manifest', () => new Response('nope', { status: 404 }), 'SERVER_ERROR'],
    ['a server error', () => new Response('oops', { status: 503 }), 'SERVER_ERROR'],
    ['a body that is not JSON', () => new Response('<html>', { status: 200 }), 'FEED_INVALID'],
    ['a manifest of another application', () => new Response(manifestJson({ app: 'other' }), { status: 200 }), 'FEED_INVALID'],
    ['a manifest with a bad checksum', () => new Response(manifestJson({
      assets: { 'win32-x64': { name: 'a.exe', size: INSTALLER.length, sha256: 'nope' } },
    }), { status: 200 }), 'FEED_INVALID'],
    ['a newer release without an installer for this machine', () => new Response(manifestJson({
      assets: { 'darwin-arm64': { name: 'a.dmg', size: INSTALLER.length, sha256: INSTALLER_SHA } },
    }), { status: 200 }), 'FEED_INVALID'],
  ])('reports %s as a failed check and leaves the app as it was', async (_label, respond, code) => {
    const h = harness();
    h.routes.set(endpoints.manifestUrl, respond as Route);

    const state = await h.service.checkForUpdates('manual');

    expect(state.phase).toBe('error');
    expect(state.error).toEqual({ stage: 'check', code });
    expect(state.update).toBeUndefined();
  });

  it('does not count a check that never reached the feed as a check', async () => {
    const h = harness();
    h.routes.set(endpoints.manifestUrl, () => Promise.reject(new TypeError('fetch failed')) as never);

    expect((await h.service.checkForUpdates('manual')).checkedAt).toBeUndefined();
  });

  it('gives up on a feed that does not answer in time', async () => {
    const h = harness({ timing: { manifestTimeoutMs: 50 } });
    h.routes.set(endpoints.manifestUrl, init => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
      },
    }), { status: 200 }));

    const state = await h.service.checkForUpdates('manual');

    expect(state.error).toEqual({ stage: 'check', code: 'TIMEOUT' });
  });

  it('refuses a feed that redirects to a host the endpoints do not trust', async () => {
    const h = harness();
    h.routes.set(endpoints.manifestUrl, () => {
      const response = new Response(manifestJson(), { status: 200 });
      Object.defineProperty(response, 'url', { value: 'https://evil.example/update-manifest.json' });
      return response;
    });

    expect((await h.service.checkForUpdates('manual')).error).toEqual({ stage: 'check', code: 'SERVER_ERROR' });
  });

  it('can check again after a failed check, with a different timestamp only for a successful one', async () => {
    const h = harness({ now: () => 5_000 });
    h.routes.set(endpoints.manifestUrl, () => Promise.reject(new TypeError('fetch failed')) as never);
    expect((await h.service.checkForUpdates('manual')).phase).toBe('error');

    h.serveManifest(manifestJson());
    const state = await h.service.checkForUpdates('manual');

    expect(state.phase).toBe('available');
    expect(state.checkedAt).toBe(5_000);
    expect(state.error).toBeUndefined();
  });

  it('goes straight to ready when the verified installer is already on disk from an earlier run', async () => {
    const h = harness();
    h.serveManifest(manifestJson());
    await mkdir(path.dirname(h.stagedPath()), { recursive: true });
    await writeFile(h.stagedPath(), INSTALLER);

    const state = await h.service.checkForUpdates('startup');

    expect(state.phase).toBe('ready');
    expect(state.update?.version).toBe('1.2.0');
    expect(h.fetchUrls).toEqual([endpoints.manifestUrl]);
  });

  it('does not trust a staged file that differs from the manifest', async () => {
    const h = harness();
    h.serveManifest(manifestJson());
    await mkdir(path.dirname(h.stagedPath()), { recursive: true });
    const altered = Buffer.from(INSTALLER);
    altered[100] ^= 0xff;
    await writeFile(h.stagedPath(), altered);

    expect((await h.service.checkForUpdates('startup')).phase).toBe('available');
  });
});

describe('downloading an update', () => {
  async function available(h: Harness): Promise<void> {
    h.serveManifest(manifestJson());
    h.serveInstaller();
    await h.service.checkForUpdates('manual');
    h.states.length = 0;
  }

  it('downloads the installer of the release, reports progress and ends ready', async () => {
    const h = harness();
    await available(h);

    const state = await h.service.downloadUpdate();

    expect(state.phase).toBe('ready');
    expect(state.update).toEqual({ version: '1.2.0', mandatory: false, sizeBytes: INSTALLER.length });
    expect((await readFile(h.stagedPath())).equals(INSTALLER)).toBe(true);
    expect(await readdir(path.dirname(h.stagedPath()))).toEqual([ASSET_NAME]);
    expect(h.fetchUrls.at(-1)).toBe(releaseAssetUrl('1.2.0', ASSET_NAME));

    const downloading = h.states.filter(item => item.phase === 'downloading');
    expect(downloading.length).toBeGreaterThan(2);
    const received = downloading.map(item => item.progress?.receivedBytes ?? -1);
    expect(received[0]).toBe(0);
    expect(received.at(-1)).toBe(INSTALLER.length);
    expect([...received].sort((a, b) => a - b)).toEqual(received);
    expect(downloading.every(item => item.progress?.totalBytes === INSTALLER.length)).toBe(true);
    expect(h.states.at(-1)?.phase).toBe('ready');
  });

  it('throttles progress events but always reports the last byte', async () => {
    const h = harness({ timing: { progressIntervalMs: 60_000 } });
    await available(h);

    await h.service.downloadUpdate();

    const received = h.states.filter(item => item.phase === 'downloading').map(item => item.progress?.receivedBytes);
    expect(received).toEqual([0, INSTALLER.length]);
  });

  it('is a single download however many times it is asked for', async () => {
    const h = harness();
    await available(h);

    const [first, second] = await Promise.all([h.service.downloadUpdate(), h.service.downloadUpdate()]);

    expect(first).toEqual(second);
    expect(h.fetchUrls.filter(url => url.endsWith('.exe'))).toHaveLength(1);
  });

  it('does nothing when no update was found', async () => {
    const h = harness();

    expect((await h.service.downloadUpdate()).phase).toBe('idle');
    expect(h.fetchUrls).toEqual([]);
  });

  it('can be cancelled, goes back to offering the update and leaves nothing on disk', async () => {
    const h = harness();
    h.serveManifest(manifestJson());
    h.routes.set(releaseAssetUrl('1.2.0', ASSET_NAME), init => new Response(
      slicedBody(INSTALLER, init?.signal, { hangAfter: 300_000 }),
      { status: 200, headers: { 'content-length': String(INSTALLER.length) } },
    ));
    await h.service.checkForUpdates('manual');

    const download = h.service.downloadUpdate();
    await waitFor(() => expect(h.service.getState().progress?.receivedBytes ?? 0).toBeGreaterThan(0));
    h.service.cancelDownload();
    const state = await download;

    expect(state.phase).toBe('available');
    expect(state.update?.version).toBe('1.2.0');
    expect(state.error).toBeUndefined();
    expect(await readdir(path.dirname(h.stagedPath()))).toEqual([]);
  });

  it('reports a corrupted download, keeps the update for a retry and succeeds on the retry', async () => {
    const h = harness();
    h.serveManifest(manifestJson());
    const corrupted = Buffer.from(INSTALLER);
    corrupted[2_000] ^= 0xff;
    h.serveInstaller('1.2.0', corrupted);
    await h.service.checkForUpdates('manual');

    const failed = await h.service.downloadUpdate();

    expect(failed.phase).toBe('error');
    expect(failed.error).toEqual({ stage: 'download', code: 'INTEGRITY' });
    expect(failed.update?.version).toBe('1.2.0');
    expect(await readdir(path.dirname(h.stagedPath())).catch(() => [])).toEqual([]);

    h.serveInstaller('1.2.0', INSTALLER);
    expect((await h.service.downloadUpdate()).phase).toBe('ready');
  });

  it.each([
    ['the connection drops', () => Promise.reject(new TypeError('fetch failed')) as never, 'OFFLINE'],
    ['the server answers with an error', () => new Response('no', { status: 500 }), 'SERVER_ERROR'],
  ])('reports a failed download when %s', async (_label, respond, code) => {
    const h = harness();
    h.serveManifest(manifestJson());
    h.routes.set(releaseAssetUrl('1.2.0', ASSET_NAME), respond as Route);
    await h.service.checkForUpdates('manual');

    const state = await h.service.downloadUpdate();

    expect(state.error).toEqual({ stage: 'download', code });
    expect(state.update?.mandatory).toBe(false);
  });

  it('refuses to start when the disk does not have room for the installer, without requesting it', async () => {
    const h = harness({ freeDiskBytes: () => Promise.resolve(INSTALLER.length) });
    await available(h);

    const state = await h.service.downloadUpdate();

    expect(state.error).toEqual({ stage: 'download', code: 'DISK_SPACE' });
    expect(h.fetchUrls.filter(url => url.endsWith('.exe'))).toEqual([]);
  });

  it('stops a download that stalls', async () => {
    const h = harness({ timing: { stallTimeoutMs: 100 } });
    h.serveManifest(manifestJson());
    h.routes.set(releaseAssetUrl('1.2.0', ASSET_NAME), init => new Response(
      slicedBody(INSTALLER, init?.signal, { hangAfter: 256 * 1024 }),
      { status: 200, headers: { 'content-length': String(INSTALLER.length) } },
    ));
    await h.service.checkForUpdates('manual');

    expect((await h.service.downloadUpdate()).error).toEqual({ stage: 'download', code: 'TIMEOUT' });
  });
});

describe('applying an update (restart mode)', () => {
  async function ready(h: Harness): Promise<void> {
    h.serveManifest(manifestJson());
    h.serveInstaller();
    await h.service.checkForUpdates('manual');
    await h.service.downloadUpdate();
    h.states.length = 0;
  }

  it('runs the verified installer and then quits the app, leaving the state at "installing" for the new version to replace', async () => {
    const h = harness();
    await ready(h);

    const state = await h.service.installUpdate();

    expect(h.installer.install).toHaveBeenCalledExactlyOnceWith(h.stagedPath());
    expect(h.requestQuit).toHaveBeenCalledOnce();
    expect(state.phase).toBe('installing');
    expect(phases(h.states)).toEqual(['installing']);
    // The order matters: the new version is installed before the app is asked to quit.
    expect(h.installer.install.mock.invocationCallOrder[0]).toBeLessThan(h.requestQuit.mock.invocationCallOrder[0]);
  });

  it('is not run twice, however many times it is pressed', async () => {
    const h = harness();
    await ready(h);

    await Promise.all([h.service.installUpdate(), h.service.installUpdate()]);
    await h.service.installUpdate();

    expect(h.installer.install).toHaveBeenCalledOnce();
    expect(h.requestQuit).toHaveBeenCalledOnce();
  });

  it('only runs from a downloaded update', async () => {
    const h = harness();
    expect((await h.service.installUpdate()).phase).toBe('idle');
    h.serveManifest(manifestJson());
    await h.service.checkForUpdates('manual');
    expect((await h.service.installUpdate()).phase).toBe('available');
    expect(h.installer.install).not.toHaveBeenCalled();
  });

  it('does not restart while a LAN room is open, says why, and allows it once the room is closed', async () => {
    const h = harness();
    await ready(h);
    h.host.busy = true;
    h.service.refreshSafety();
    expect(h.states.at(-1)).toMatchObject({ phase: 'ready', installBlocked: 'HOST_OPEN' });

    const blocked = await h.service.installUpdate();

    expect(blocked).toMatchObject({ phase: 'ready', installBlocked: 'HOST_OPEN' });
    expect(h.installer.install).not.toHaveBeenCalled();
    expect(h.requestQuit).not.toHaveBeenCalled();

    h.host.busy = false;
    h.service.refreshSafety();
    expect(h.states.at(-1)?.installBlocked).toBeUndefined();
    expect((await h.service.installUpdate()).phase).toBe('installing');
    expect(h.installer.install).toHaveBeenCalledOnce();
  });

  it('announces a change in whether an install may run only when it changes', async () => {
    const h = harness();
    await ready(h);

    h.service.refreshSafety();
    expect(h.states).toEqual([]);
    h.host.busy = true;
    h.service.refreshSafety();
    h.service.refreshSafety();
    expect(h.states).toHaveLength(1);
  });

  it('keeps the game running and the update retryable when the installer fails', async () => {
    const h = harness();
    await ready(h);
    h.installer.install.mockResolvedValueOnce({ ok: false, code: 'INSTALL_FAILED' });

    const failed = await h.service.installUpdate();

    expect(failed.phase).toBe('error');
    expect(failed.error).toEqual({ stage: 'install', code: 'INSTALL_FAILED' });
    expect(failed.update?.version).toBe('1.2.0');
    expect(h.requestQuit).not.toHaveBeenCalled();

    const retried = await h.service.installUpdate();
    expect(retried.phase).toBe('installing');
    expect(h.requestQuit).toHaveBeenCalledOnce();
  });

  it('reports an installer that throws as a failed install', async () => {
    const h = harness();
    await ready(h);
    h.installer.install.mockRejectedValueOnce(new Error('boom'));

    expect((await h.service.installUpdate()).error).toEqual({ stage: 'install', code: 'INSTALL_FAILED' });
    expect(h.requestQuit).not.toHaveBeenCalled();
  });

  it('does not run a file that changed after it was verified, and offers the download again', async () => {
    const h = harness();
    await ready(h);
    await writeFile(h.stagedPath(), 'something else');

    const state = await h.service.installUpdate();

    expect(state.error).toEqual({ stage: 'download', code: 'INTEGRITY' });
    expect(h.installer.install).not.toHaveBeenCalled();
    expect((await h.service.downloadUpdate()).phase).toBe('ready');
  });

  it('does not report a working install as failed when only asking the app to quit throws', async () => {
    const h = harness();
    await ready(h);
    h.requestQuit.mockImplementationOnce(() => { throw new Error('quit failed'); });

    const state = await h.service.installUpdate();

    expect(state).toMatchObject({ phase: 'ready', followUp: 'restart-manually' });
    expect(state.error).toBeUndefined();
    expect(h.installer.install).toHaveBeenCalledOnce();
  });

  it('tells the player to restart by hand when the app does not go away after the installer succeeded', async () => {
    const h = harness({ timing: { quitWatchdogMs: 30 } });
    await ready(h);

    await h.service.installUpdate();
    await waitFor(() => expect(h.service.getState().phase).toBe('ready'));

    expect(h.service.getState().followUp).toBe('restart-manually');
  });
});

describe('applying an update (open-installer mode)', () => {
  it('opens the installer, stays ready with the follow-up, never quits and is not blocked by an open room', async () => {
    const h = harness({ installerMode: 'open-installer' });
    h.serveManifest(manifestJson());
    h.serveInstaller();
    await h.service.checkForUpdates('manual');
    await h.service.downloadUpdate();
    h.host.busy = true;

    const state = await h.service.installUpdate();

    expect(h.installer.install).toHaveBeenCalledExactlyOnceWith(h.stagedPath());
    expect(h.requestQuit).not.toHaveBeenCalled();
    expect(state).toMatchObject({ phase: 'ready', followUp: 'installer-opened', installMode: 'open-installer' });
    expect(state.installBlocked).toBeUndefined();

    // Pressing it again opens the installer again (the player closed the window, say).
    await h.service.installUpdate();
    expect(h.installer.install).toHaveBeenCalledTimes(2);
  });
});

describe('scheduling and clean-up', () => {
  it('checks once shortly after start and again on the interval, and stops at dispose', async () => {
    const h = harness({ timing: { startupDelayMs: 20, periodicIntervalMs: 80 } });
    h.serveManifest(manifestJson({ version: '1.1.1' }));

    h.service.start();
    h.service.start();
    expect(h.fetchUrls).toEqual([]);
    await waitFor(() => expect(h.fetchUrls.length).toBeGreaterThanOrEqual(1));
    await waitFor(() => expect(h.fetchUrls.length).toBeGreaterThanOrEqual(2));

    h.service.dispose();
    const after = h.fetchUrls.length;
    await new Promise(resolve => { setTimeout(resolve, 200); });
    expect(h.fetchUrls.length).toBe(after);
  });

  it('removes installers of the running version and older at start, and keeps newer ones and foreign folders', async () => {
    const h = harness({ timing: { startupDelayMs: 60_000, periodicIntervalMs: 60_000 } });
    for (const name of ['1.0.0', '1.1.1', '1.2.0', 'notes']) {
      await mkdir(path.join(h.updatesDirectory, name), { recursive: true });
      await writeFile(path.join(h.updatesDirectory, name, 'file.bin'), 'x');
    }
    await writeFile(path.join(h.updatesDirectory, 'stray.txt'), 'x');

    h.service.start();

    await waitFor(async () => {
      expect((await readdir(h.updatesDirectory)).sort()).toEqual(['1.2.0', 'notes', 'stray.txt']);
    });
  });

  it('removes staged installers of releases that are no longer the newest after a check', async () => {
    const h = harness();
    h.serveManifest(manifestJson({ version: '1.3.0' }));
    for (const name of ['1.2.0', '1.3.0']) {
      await mkdir(path.join(h.updatesDirectory, name), { recursive: true });
      await writeFile(path.join(h.updatesDirectory, name, 'file.bin'), 'x');
    }

    await h.service.checkForUpdates('manual');

    await waitFor(async () => {
      expect(await readdir(h.updatesDirectory)).toEqual(['1.3.0']);
    });
  });

  it('stops a running download at dispose and publishes nothing afterwards', async () => {
    const h = harness();
    h.serveManifest(manifestJson());
    h.routes.set(releaseAssetUrl('1.2.0', ASSET_NAME), init => new Response(
      slicedBody(INSTALLER, init?.signal, { hangAfter: 256 * 1024 }),
      { status: 200, headers: { 'content-length': String(INSTALLER.length) } },
    ));
    await h.service.checkForUpdates('manual');
    const download = h.service.downloadUpdate();
    await waitFor(() => expect(h.service.getState().progress?.receivedBytes ?? 0).toBeGreaterThan(0));
    const emitted = h.states.length;

    h.service.dispose();
    await download;

    expect(h.states.length).toBe(emitted);
    await expect(stat(h.stagedPath())).rejects.toThrow();
  });

  it('keeps notifying the other listeners when one throws, and stops notifying an unsubscribed one', async () => {
    const h = harness();
    h.serveManifest(manifestJson({ version: '1.1.1' }));
    const throwing = vi.fn(() => { throw new Error('listener failed'); });
    const remaining = vi.fn();
    const removed = vi.fn();
    h.service.onStateChanged(throwing);
    h.service.onStateChanged(remaining);
    h.service.onStateChanged(removed)();

    await h.service.checkForUpdates('manual');

    expect(throwing).toHaveBeenCalled();
    expect(remaining).toHaveBeenCalled();
    expect(removed).not.toHaveBeenCalled();
  });
});
