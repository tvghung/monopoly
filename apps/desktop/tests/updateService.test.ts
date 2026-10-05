import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstallOutcome, UpdateInstaller } from '../src/update/installers';
import { MIN_ASSET_BYTES } from '../src/update/manifest';
import {
  DOWNLOAD_HEADROOM_BYTES,
  productionEndpoints,
  releaseAssetUrl,
  SQUIRREL_UNPACK_HEADROOM_BYTES,
} from '../src/update/updateConfig';
import { UpdateService, type UpdateServiceOptions } from '../src/update/updateService';
import type { AppUpdateState } from '../src/update/updateTypes';

// These tests write and hash installer-sized files and wait on real timers. A slow or busy machine (a CI runner, or this
// one under load) must not turn "late" into "failed": a test that is quick when the machine is quick costs nothing extra.
vi.setConfig({ testTimeout: 30_000 });
const waitFor = <T>(check: () => T | Promise<T>) => vi.waitFor(check, { timeout: 15_000, interval: 25 });

const endpoints = productionEndpoints();
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

// The release as the manifest describes it: the Setup.exe (what a player opens by hand, and what an installation that
// cannot update itself in place downloads), and the Squirrel feed that an installed Windows app applies in place.
const INSTALLER = randomBytes(MIN_ASSET_BYTES + 4_096);
const RELEASES = Buffer.from(`\u{feff}${'A'.repeat(40)} own_the_block-1.2.0-full.nupkg 1052672`);
const PACKAGE = randomBytes(MIN_ASSET_BYTES + 8_192);
const FEED_BYTES = RELEASES.length + PACKAGE.length;
const SETUP_NAME = 'OwnTheBlock-1.2.0-win32-x64-Setup.exe';
const RELEASES_NAME = 'RELEASES';
const PACKAGE_NAME = 'own_the_block-1.2.0-full.nupkg';

interface ManifestOptions {
  version?: string;
  minimumSupportedVersion?: string;
  assets?: Record<string, unknown>;
  app?: string;
  /** Whether the Windows entry lists the Squirrel files (default: yes, as every Windows release does). */
  squirrel?: boolean;
}

function windowsAsset(version: string, withSquirrel: boolean): Record<string, unknown> {
  return {
    name: `OwnTheBlock-${version}-win32-x64-Setup.exe`,
    size: INSTALLER.length,
    sha256: sha256(INSTALLER),
    ...(withSquirrel
      ? {
          squirrel: {
            releases: { name: RELEASES_NAME, size: RELEASES.length, sha256: sha256(RELEASES) },
            package: { name: `own_the_block-${version}-full.nupkg`, size: PACKAGE.length, sha256: sha256(PACKAGE) },
          },
        }
      : {}),
  };
}

function manifestJson(options: ManifestOptions = {}): string {
  const version = options.version ?? '1.2.0';
  return JSON.stringify({
    schemaVersion: 1,
    app: options.app ?? 'own-the-block',
    version,
    minimumSupportedVersion: options.minimumSupportedVersion ?? '1.0.0',
    assets: options.assets ?? { 'win32-x64': windowsAsset(version, options.squirrel ?? true) },
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

const served = (bytes: Buffer, options?: { hangAfter?: number }): Route => init => new Response(
  slicedBody(bytes, init?.signal, options),
  { status: 200, headers: { 'content-length': String(bytes.length) } },
);

interface Harness {
  service: UpdateService;
  states: AppUpdateState[];
  fetchUrls: string[];
  routes: Map<string, Route>;
  installer: { mode: UpdateInstaller['mode']; payload: UpdateInstaller['payload']; install: ReturnType<typeof vi.fn> };
  requestQuit: ReturnType<typeof vi.fn>;
  host: { busy: boolean };
  updatesDirectory: string;
  /** The folder the files of release `version` are staged in: named after what this installation downloads. */
  stagedDirectory(version?: string): string;
  /** A staged file; by default the one the installer works on (the Squirrel package, or the Setup.exe). */
  stagedPath(name?: string, version?: string): string;
  serveManifest(text: string): void;
  /** Serves what this installation downloads: the Squirrel feed (restart mode) or the Setup.exe (open-installer mode). */
  serveUpdate(version?: string, bytes?: { releases?: Buffer; package?: Buffer; installer?: Buffer }): void;
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
  // The two real installers: a restart applies the Squirrel feed in place, opening an installer needs the installer itself.
  const payload: UpdateInstaller['payload'] = installerMode === 'restart' ? 'squirrel' : 'installer';
  const updatesDirectory = path.join(workspace, 'updates');
  const routes = new Map<string, Route>();
  const fetchUrls: string[] = [];
  const states: AppUpdateState[] = [];
  const host = { busy: false };
  const requestQuit = vi.fn();
  const installer = {
    mode: installerMode,
    payload,
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

  const stagedDirectory = (version = '1.2.0') => path.join(updatesDirectory, version, payload);
  const result: Harness = {
    service,
    states,
    fetchUrls,
    routes,
    installer,
    requestQuit,
    host,
    updatesDirectory,
    stagedDirectory,
    stagedPath: (name = payload === 'squirrel' ? PACKAGE_NAME : SETUP_NAME, version) => path.join(stagedDirectory(version), name),
    serveManifest: text => {
      routes.set(endpoints.manifestUrl, () => new Response(text, { status: 200 }));
    },
    serveUpdate: (version = '1.2.0', bytes = {}) => {
      if (payload === 'installer') {
        routes.set(releaseAssetUrl(version, `OwnTheBlock-${version}-win32-x64-Setup.exe`), served(bytes.installer ?? INSTALLER));
        return;
      }
      routes.set(releaseAssetUrl(version, RELEASES_NAME), served(bytes.releases ?? RELEASES));
      routes.set(releaseAssetUrl(version, `own_the_block-${version}-full.nupkg`), served(bytes.package ?? PACKAGE));
    },
  };
  return result;
}

const phases = (states: AppUpdateState[]) => states.map(state => state.phase);
const urlOf = (name: string, version = '1.2.0') => releaseAssetUrl(version, name);

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

  it('offers a newer release with its version and the size of what the app would download, and does not start downloading it', async () => {
    const h = harness();
    h.serveManifest(manifestJson());

    const state = await h.service.checkForUpdates('startup');

    expect(state.phase).toBe('available');
    expect(state.update).toEqual({ version: '1.2.0', mandatory: false, sizeBytes: FEED_BYTES });
    expect(h.fetchUrls).toEqual([endpoints.manifestUrl]);
  });

  it('offers the installer, and its size, to an installation that opens the installer instead of updating in place', async () => {
    const h = harness({ installerMode: 'open-installer' });
    // A macOS release has no Squirrel files at all.
    h.serveManifest(manifestJson({ squirrel: false }));

    const state = await h.service.checkForUpdates('startup');

    expect(state.phase).toBe('available');
    expect(state.update).toEqual({ version: '1.2.0', mandatory: false, sizeBytes: INSTALLER.length });
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
      assets: { 'darwin-arm64': { name: 'a.dmg', size: INSTALLER.length, sha256: sha256(INSTALLER) } },
    }), { status: 200 }), 'FEED_INVALID'],
    ['a newer Windows release without the Squirrel files this installation updates from', () => new Response(
      manifestJson({ squirrel: false }),
      { status: 200 },
    ), 'FEED_INVALID'],
    ['a Squirrel payload with a bad checksum', () => new Response(manifestJson({
      assets: {
        'win32-x64': {
          ...windowsAsset('1.2.0', true),
          squirrel: {
            releases: { name: RELEASES_NAME, size: RELEASES.length, sha256: 'nope' },
            package: { name: PACKAGE_NAME, size: PACKAGE.length, sha256: sha256(PACKAGE) },
          },
        },
      },
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

  it('goes straight to ready when every verified file is already on disk from an earlier run', async () => {
    const h = harness();
    h.serveManifest(manifestJson());
    await mkdir(h.stagedDirectory(), { recursive: true });
    await writeFile(h.stagedPath(RELEASES_NAME), RELEASES);
    await writeFile(h.stagedPath(), PACKAGE);

    const state = await h.service.checkForUpdates('startup');

    expect(state.phase).toBe('ready');
    expect(state.update?.version).toBe('1.2.0');
    expect(h.fetchUrls).toEqual([endpoints.manifestUrl]);
  });

  it('offers the update again when only some of its files are staged', async () => {
    const h = harness();
    h.serveManifest(manifestJson());
    await mkdir(h.stagedDirectory(), { recursive: true });
    await writeFile(h.stagedPath(PACKAGE_NAME), PACKAGE);

    expect((await h.service.checkForUpdates('startup')).phase).toBe('available');
  });

  it('does not trust a staged file that differs from the manifest', async () => {
    const h = harness();
    h.serveManifest(manifestJson());
    await mkdir(h.stagedDirectory(), { recursive: true });
    await writeFile(h.stagedPath(RELEASES_NAME), RELEASES);
    const altered = Buffer.from(PACKAGE);
    altered[100] ^= 0xff;
    await writeFile(h.stagedPath(), altered);

    expect((await h.service.checkForUpdates('startup')).phase).toBe('available');
  });
});

describe('downloading an update', () => {
  async function available(h: Harness): Promise<void> {
    h.serveManifest(manifestJson());
    h.serveUpdate();
    await h.service.checkForUpdates('manual');
    h.states.length = 0;
  }

  it('downloads the Squirrel feed of the release (and not the Setup.exe), reports progress over both files and ends ready', async () => {
    const h = harness();
    await available(h);

    const state = await h.service.downloadUpdate();

    expect(state.phase).toBe('ready');
    expect(state.update).toEqual({ version: '1.2.0', mandatory: false, sizeBytes: FEED_BYTES });
    expect((await readFile(h.stagedPath(RELEASES_NAME))).equals(RELEASES)).toBe(true);
    expect((await readFile(h.stagedPath())).equals(PACKAGE)).toBe(true);
    // Squirrel applies the whole folder: nothing but the two files may be in it (no partial download left behind).
    expect((await readdir(h.stagedDirectory())).sort()).toEqual([PACKAGE_NAME, RELEASES_NAME].sort());
    expect(h.fetchUrls.slice(1)).toEqual([urlOf(RELEASES_NAME), urlOf(PACKAGE_NAME)]);

    const downloading = h.states.filter(item => item.phase === 'downloading');
    expect(downloading.length).toBeGreaterThan(2);
    const received = downloading.map(item => item.progress?.receivedBytes ?? -1);
    expect(received[0]).toBe(0);
    expect(received.at(-1)).toBe(FEED_BYTES);
    // One bar for the whole update: it does not start over at the second file.
    expect([...received].sort((a, b) => a - b)).toEqual(received);
    expect(downloading.every(item => item.progress?.totalBytes === FEED_BYTES)).toBe(true);
    expect(h.states.at(-1)?.phase).toBe('ready');
  });

  it('downloads the installer itself when this installation only opens the installer', async () => {
    const h = harness({ installerMode: 'open-installer' });
    await available(h);

    const state = await h.service.downloadUpdate();

    expect(state.phase).toBe('ready');
    expect((await readFile(h.stagedPath())).equals(INSTALLER)).toBe(true);
    expect(await readdir(h.stagedDirectory())).toEqual([SETUP_NAME]);
    expect(h.fetchUrls.slice(1)).toEqual([urlOf(SETUP_NAME)]);
  });

  it('throttles progress events but always reports the last byte', async () => {
    const h = harness({ timing: { progressIntervalMs: 60_000 } });
    await available(h);

    await h.service.downloadUpdate();

    const received = h.states.filter(item => item.phase === 'downloading').map(item => item.progress?.receivedBytes);
    expect(received).toEqual([0, FEED_BYTES]);
  });

  it('is a single download however many times it is asked for', async () => {
    const h = harness();
    await available(h);

    const [first, second] = await Promise.all([h.service.downloadUpdate(), h.service.downloadUpdate()]);

    expect(first).toEqual(second);
    expect(h.fetchUrls.filter(url => url.endsWith('.nupkg'))).toHaveLength(1);
  });

  it('does nothing when no update was found', async () => {
    const h = harness();

    expect((await h.service.downloadUpdate()).phase).toBe('idle');
    expect(h.fetchUrls).toEqual([]);
  });

  it('can be cancelled, goes back to offering the update and leaves no partial file on disk', async () => {
    const h = harness();
    h.serveManifest(manifestJson());
    h.serveUpdate();
    h.routes.set(urlOf(PACKAGE_NAME), served(PACKAGE, { hangAfter: 300_000 }));
    await h.service.checkForUpdates('manual');

    const download = h.service.downloadUpdate();
    await waitFor(() => expect(h.service.getState().progress?.receivedBytes ?? 0).toBeGreaterThan(RELEASES.length));
    h.service.cancelDownload();
    const state = await download;

    expect(state.phase).toBe('available');
    expect(state.update?.version).toBe('1.2.0');
    expect(state.error).toBeUndefined();
    // The small file that was already complete and verified stays (the next try skips it); the half package is gone.
    expect(await readdir(h.stagedDirectory())).toEqual([RELEASES_NAME]);
  });

  it('reports a corrupted download, keeps the update for a retry and then downloads only what is still missing', async () => {
    const h = harness();
    h.serveManifest(manifestJson());
    const corrupted = Buffer.from(PACKAGE);
    corrupted[2_000] ^= 0xff;
    h.serveUpdate('1.2.0', { package: corrupted });
    await h.service.checkForUpdates('manual');

    const failed = await h.service.downloadUpdate();

    expect(failed.phase).toBe('error');
    expect(failed.error).toEqual({ stage: 'download', code: 'INTEGRITY' });
    expect(failed.update?.version).toBe('1.2.0');
    expect(await readdir(h.stagedDirectory())).toEqual([RELEASES_NAME]);

    h.serveUpdate('1.2.0', { package: PACKAGE });
    expect((await h.service.downloadUpdate()).phase).toBe('ready');
    expect((await readFile(h.stagedPath())).equals(PACKAGE)).toBe(true);
    // The verified RELEASES file was not requested a second time.
    expect(h.fetchUrls.filter(url => url === urlOf(RELEASES_NAME))).toHaveLength(1);
    expect(h.fetchUrls.filter(url => url === urlOf(PACKAGE_NAME))).toHaveLength(2);
  });

  it('counts the files that are already staged as downloaded, so the bar starts where the earlier try ended', async () => {
    const h = harness();
    h.serveManifest(manifestJson());
    h.serveUpdate();
    await mkdir(h.stagedDirectory(), { recursive: true });
    await writeFile(h.stagedPath(RELEASES_NAME), RELEASES);
    await h.service.checkForUpdates('manual');
    h.states.length = 0;

    expect((await h.service.downloadUpdate()).phase).toBe('ready');

    const received = h.states.filter(item => item.phase === 'downloading').map(item => item.progress?.receivedBytes ?? -1);
    expect(received[0]).toBe(0);
    expect(received.at(-1)).toBe(FEED_BYTES);
    expect(h.fetchUrls.filter(url => url === urlOf(RELEASES_NAME))).toEqual([]);
  });

  it.each([
    ['the connection drops', () => Promise.reject(new TypeError('fetch failed')) as never, 'OFFLINE'],
    ['the server answers with an error', () => new Response('no', { status: 500 }), 'SERVER_ERROR'],
  ])('reports a failed download when %s', async (_label, respond, code) => {
    const h = harness();
    h.serveManifest(manifestJson());
    h.serveUpdate();
    h.routes.set(urlOf(PACKAGE_NAME), respond as Route);
    await h.service.checkForUpdates('manual');

    const state = await h.service.downloadUpdate();

    expect(state.error).toEqual({ stage: 'download', code });
    expect(state.update?.mandatory).toBe(false);
  });

  it('refuses to start when the disk does not have room for the download and for Squirrel to unpack it, without requesting anything', async () => {
    // Enough for the download itself, not for the 385 MiB Squirrel unpacks from it.
    const h = harness({ freeDiskBytes: () => Promise.resolve(FEED_BYTES + DOWNLOAD_HEADROOM_BYTES) });
    await available(h);

    const state = await h.service.downloadUpdate();

    expect(state.error).toEqual({ stage: 'download', code: 'DISK_SPACE' });
    // Only the check's manifest request: not one byte of the update was asked for.
    expect(h.fetchUrls).toEqual([endpoints.manifestUrl]);
  });

  it('asks for less room when the installer is only opened', async () => {
    const tight = harness({ installerMode: 'open-installer', freeDiskBytes: () => Promise.resolve(INSTALLER.length + DOWNLOAD_HEADROOM_BYTES - 1) });
    await available(tight);
    expect((await tight.service.downloadUpdate()).error).toEqual({ stage: 'download', code: 'DISK_SPACE' });

    const enough = harness({ installerMode: 'open-installer', freeDiskBytes: () => Promise.resolve(INSTALLER.length + DOWNLOAD_HEADROOM_BYTES) });
    await available(enough);
    expect((await enough.service.downloadUpdate()).phase).toBe('ready');
  });

  it('counts only the bytes that are still missing when it checks the room', async () => {
    // Room for the package and the unpacking, but not for the RELEASES file as well: it is already staged, so it is not counted.
    const h = harness({ freeDiskBytes: () => Promise.resolve(PACKAGE.length + SQUIRREL_UNPACK_HEADROOM_BYTES) });
    h.serveManifest(manifestJson());
    h.serveUpdate();
    await mkdir(h.stagedDirectory(), { recursive: true });
    await writeFile(h.stagedPath(RELEASES_NAME), RELEASES);
    await h.service.checkForUpdates('manual');

    expect((await h.service.downloadUpdate()).phase).toBe('ready');
  });

  it('stops a download that stalls', async () => {
    const h = harness({ timing: { stallTimeoutMs: 100 } });
    h.serveManifest(manifestJson());
    h.serveUpdate();
    h.routes.set(urlOf(PACKAGE_NAME), served(PACKAGE, { hangAfter: 256 * 1024 }));
    await h.service.checkForUpdates('manual');

    expect((await h.service.downloadUpdate()).error).toEqual({ stage: 'download', code: 'TIMEOUT' });
  });
});

describe('applying an update (restart mode)', () => {
  async function ready(h: Harness): Promise<void> {
    h.serveManifest(manifestJson());
    h.serveUpdate();
    await h.service.checkForUpdates('manual');
    await h.service.downloadUpdate();
    h.states.length = 0;
  }

  it('hands the verified Squirrel feed to the installer and then quits the app, leaving the state at "installing" for the new version to replace', async () => {
    const h = harness();
    await ready(h);

    const state = await h.service.installUpdate();

    expect(h.installer.install).toHaveBeenCalledExactlyOnceWith({ directory: h.stagedDirectory(), mainFile: h.stagedPath() });
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

  it.each([
    ['the package', PACKAGE_NAME],
    ['the RELEASES file', RELEASES_NAME],
  ])('does not run when %s changed after it was verified, and offers to download just that file again', async (_label, name) => {
    const h = harness();
    await ready(h);
    await writeFile(h.stagedPath(name), 'something else');
    h.fetchUrls.length = 0;

    const state = await h.service.installUpdate();

    expect(state.error).toEqual({ stage: 'download', code: 'INTEGRITY' });
    expect(h.installer.install).not.toHaveBeenCalled();
    expect((await h.service.downloadUpdate()).phase).toBe('ready');
    expect(h.fetchUrls).toEqual([urlOf(name)]);
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
    h.serveUpdate();
    await h.service.checkForUpdates('manual');
    await h.service.downloadUpdate();
    h.host.busy = true;

    const state = await h.service.installUpdate();

    expect(h.installer.install).toHaveBeenCalledExactlyOnceWith({ directory: h.stagedDirectory(), mainFile: h.stagedPath() });
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

  it('removes staged updates of the running version and older at start, and keeps newer ones and foreign folders', async () => {
    const h = harness({ timing: { startupDelayMs: 60_000, periodicIntervalMs: 60_000 } });
    for (const name of ['1.0.0', '1.1.1', '1.2.0', 'notes']) {
      await mkdir(path.join(h.updatesDirectory, name, 'squirrel'), { recursive: true });
      await writeFile(path.join(h.updatesDirectory, name, 'squirrel', 'file.bin'), 'x');
    }
    await writeFile(path.join(h.updatesDirectory, 'stray.txt'), 'x');

    h.service.start();

    await waitFor(async () => {
      expect((await readdir(h.updatesDirectory)).sort()).toEqual(['1.2.0', 'notes', 'stray.txt']);
    });
  });

  it('removes staged updates of releases that are no longer the newest after a check', async () => {
    const h = harness();
    h.serveManifest(manifestJson({ version: '1.3.0' }));
    for (const name of ['1.2.0', '1.3.0']) {
      await mkdir(path.join(h.updatesDirectory, name, 'squirrel'), { recursive: true });
      await writeFile(path.join(h.updatesDirectory, name, 'squirrel', 'file.bin'), 'x');
    }

    await h.service.checkForUpdates('manual');

    await waitFor(async () => {
      expect(await readdir(h.updatesDirectory)).toEqual(['1.3.0']);
    });
  });

  it('stops a running download at dispose and publishes nothing afterwards', async () => {
    const h = harness();
    h.serveManifest(manifestJson());
    h.serveUpdate();
    h.routes.set(urlOf(PACKAGE_NAME), served(PACKAGE, { hangAfter: 256 * 1024 }));
    await h.service.checkForUpdates('manual');
    const download = h.service.downloadUpdate();
    await waitFor(() => expect(h.service.getState().progress?.receivedBytes ?? 0).toBeGreaterThan(RELEASES.length));
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
