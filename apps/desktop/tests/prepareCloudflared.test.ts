import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pinnedAsset, prepareCloudflared } from '../scripts/cloudflaredBinary.mjs';
import integrity from '../cloudflared-integrity.json';

const sha256 = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');
const LICENSE = Buffer.from('Apache License\nVersion 2.0, January 2004 (fixture)\n');
const OFFICIAL_EXE = Buffer.from('official cloudflared executable');
const VERSION = '2099.1.1';
const LICENSE_URL = `https://raw.githubusercontent.com/cloudflare/cloudflared/${VERSION}/LICENSE`;
const releaseUrl = (name: string): string => `https://github.com/cloudflare/cloudflared/releases/download/${VERSION}/${name}`;

let temporary: string;
let root: string;

/** Is a tar that handles native paths available? (GNU tar from Git for Windows is not.) */
function tarWorks(): boolean {
  try {
    const probe = path.join(os.tmpdir(), `otb-tar-probe-${String(process.pid)}`);
    execFileSync('node', ['-e', `require('node:fs').mkdirSync(${JSON.stringify(probe)}, { recursive: true });`
      + `require('node:fs').writeFileSync(${JSON.stringify(path.join(probe, 'cloudflared'))}, 'x')`]);
    execFileSync('tar', ['-czf', path.join(probe, 'a.tgz'), '-C', probe, 'cloudflared'], { stdio: 'ignore' });
    execFileSync('tar', ['-tzf', path.join(probe, 'a.tgz')], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}
const TAR = tarWorks();

async function makeTgz(content: Buffer): Promise<Buffer> {
  const directory = await mkdtemp(path.join(temporary, 'archive-'));
  await writeFile(path.join(directory, 'cloudflared'), content);
  const archive = path.join(directory, 'asset.tgz');
  execFileSync('tar', ['-czf', archive, '-C', directory, 'cloudflared'], { stdio: 'ignore' });
  return readFile(archive);
}

function windowsManifest(exe = OFFICIAL_EXE) {
  return {
    version: VERSION,
    licenseSha256: sha256(LICENSE),
    assets: {
      'win32-x64': {
        name: 'cloudflared-windows-amd64.exe',
        archiveSha256: sha256(exe),
        executableSha256: sha256(exe),
      },
    },
  };
}

/** A fake release server: only the URLs it was given resolve, and every request is recorded. */
function server(files: Record<string, Buffer>) {
  const requests: string[] = [];
  return {
    requests,
    download: (url: string): Promise<Buffer> => {
      requests.push(url);
      const body = files[url];
      return body ? Promise.resolve(body) : Promise.reject(new Error(`Download failed (404) for ${url}`));
    },
  };
}

const winFiles = (exe = OFFICIAL_EXE): Record<string, Buffer> => ({
  [releaseUrl('cloudflared-windows-amd64.exe')]: exe,
  [LICENSE_URL]: LICENSE,
});
const executable = (platform = 'win32', arch = 'x64'): string => path.join(
  root, `${platform}-${arch}`, platform === 'win32' ? 'cloudflared.exe' : 'cloudflared',
);
const sidecar = (platform = 'win32', arch = 'x64'): string => path.join(root, `${platform}-${arch}`, 'cloudflared.sha256');

beforeEach(async () => {
  temporary = await mkdtemp(path.join(os.tmpdir(), 'otb-prepare-cloudflared-'));
  root = path.join(temporary, 'generated', 'cloudflared');
});

afterEach(async () => {
  await rm(temporary, { recursive: true, force: true });
});

describe('cloudflared preparation: Windows (raw executable)', () => {
  const run = (files: Record<string, Buffer>, manifest = windowsManifest()) => {
    const release = server(files);
    return { release, result: prepareCloudflared({ manifest, root, platform: 'win32', arch: 'x64', download: release.download }) };
  };

  it('accepts the official asset, records the verified digest and keeps the license', async () => {
    const { release, result } = run(winFiles());
    await expect(result).resolves.toMatchObject({ status: 'prepared', target: 'win32-x64' });
    expect(release.requests).toEqual([releaseUrl('cloudflared-windows-amd64.exe'), LICENSE_URL]);
    expect(readFileSync(executable())).toEqual(OFFICIAL_EXE);
    expect(readFileSync(sidecar(), 'utf8').trim()).toBe(sha256(OFFICIAL_EXE));
    expect(readFileSync(path.join(root, 'LICENSE.cloudflared'))).toEqual(LICENSE);
  });

  it('accepts the cached executable without downloading it again', async () => {
    await run(winFiles()).result;
    const { release, result } = run({});
    await expect(result).resolves.toMatchObject({ status: 'cached' });
    expect(release.requests).toEqual([]);
  });

  it('rejects a modified cached executable and replaces it with the official one', async () => {
    await run(winFiles()).result;
    await writeFile(executable(), 'attacker controlled executable');
    const { release, result } = run(winFiles());
    await expect(result).resolves.toMatchObject({ status: 'prepared' });
    expect(release.requests).toContain(releaseUrl('cloudflared-windows-amd64.exe'));
    expect(readFileSync(executable())).toEqual(OFFICIAL_EXE);
  });

  it('rejects a modified executable even when its adjacent checksum file was modified to match', async () => {
    await run(winFiles()).result;
    await writeFile(executable(), 'attacker controlled executable');
    await writeFile(sidecar(), `${sha256('attacker controlled executable')}\n`);
    const { release, result } = run(winFiles());
    await expect(result).resolves.toMatchObject({ status: 'prepared' });
    expect(release.requests).toContain(releaseUrl('cloudflared-windows-amd64.exe'));
    expect(readFileSync(executable())).toEqual(OFFICIAL_EXE);
    expect(readFileSync(sidecar(), 'utf8').trim()).toBe(sha256(OFFICIAL_EXE));
  });

  it('never leaves a tampered cache behind when the replacement cannot be obtained', async () => {
    await run(winFiles()).result;
    await writeFile(executable(), 'attacker controlled executable');
    await expect(run({}).result).rejects.toThrow(/Download failed \(404\)/u);
    expect(existsSync(executable())).toBe(false);
    expect(existsSync(path.join(root, 'win32-x64'))).toBe(false);
  });

  it('rejects a download that is not the pinned asset and writes nothing', async () => {
    const { result } = run(winFiles(Buffer.from('a different file served from the release URL')));
    await expect(result).rejects.toThrow('Official cloudflared asset checksum mismatch');
    expect(existsSync(path.join(root, 'win32-x64'))).toBe(false);
  });

  it('rejects a truncated download', async () => {
    const { result } = run(winFiles(OFFICIAL_EXE.subarray(0, 10)));
    await expect(result).rejects.toThrow('Official cloudflared asset checksum mismatch');
    expect(existsSync(executable())).toBe(false);
  });

  it('rejects a license text that is not the pinned one, and replaces a tampered cached license', async () => {
    await expect(run({ ...winFiles(), [LICENSE_URL]: Buffer.from('Apache License (altered)') }).result)
      .rejects.toThrow('Official cloudflared license checksum mismatch');
    await run(winFiles()).result;
    await writeFile(path.join(root, 'LICENSE.cloudflared'), 'tampered');
    const { release, result } = run(winFiles());
    await expect(result).resolves.toMatchObject({ status: 'cached' });
    expect(release.requests).toEqual([LICENSE_URL]);
    expect(readFileSync(path.join(root, 'LICENSE.cloudflared'))).toEqual(LICENSE);
  });

  it('fails closed on incomplete hash metadata without contacting the network', async () => {
    const complete = windowsManifest();
    const asset = complete.assets['win32-x64'];
    const broken = [
      { ...complete, assets: { 'win32-x64': { ...asset, executableSha256: '' } } },
      { ...complete, assets: { 'win32-x64': { ...asset, archiveSha256: undefined } } },
      { ...complete, assets: { 'win32-x64': { ...asset, archiveSha256: 'F'.repeat(64) } } },
      { ...complete, assets: { 'win32-x64': { ...asset, name: '../escape.exe' } } },
      { ...complete, assets: { 'win32-x64': { ...asset, name: undefined } } },
      { ...complete, licenseSha256: undefined },
      { ...complete, version: '' },
      { ...complete, assets: {} },
    ];
    for (const manifest of broken) {
      const { release, result } = run(winFiles(), manifest as ReturnType<typeof windowsManifest>);
      await expect(result).rejects.toThrow(/incomplete|unavailable/u);
      expect(release.requests).toEqual([]);
    }
    expect(existsSync(root)).toBe(false);
  });

  it('refuses a platform that has no pinned binary', async () => {
    const release = server(winFiles());
    await expect(prepareCloudflared({ manifest: windowsManifest(), root, platform: 'linux', arch: 'x64', download: release.download }))
      .rejects.toThrow('Cloudflare Tunnel binary is unavailable for linux-x64');
    expect(release.requests).toEqual([]);
  });
});

describe.skipIf(!TAR)('cloudflared preparation: macOS (.tgz archive)', () => {
  async function darwin(content: Buffer = OFFICIAL_EXE) {
    const archive = await makeTgz(content);
    const manifest = {
      version: VERSION,
      licenseSha256: sha256(LICENSE),
      assets: {
        'darwin-arm64': {
          name: 'cloudflared-darwin-arm64.tgz',
          archiveSha256: sha256(archive),
          executableSha256: sha256(OFFICIAL_EXE),
        },
      },
    };
    const files = { [releaseUrl('cloudflared-darwin-arm64.tgz')]: archive, [LICENSE_URL]: LICENSE };
    const release = server(files);
    const run = () => prepareCloudflared({ manifest, root, platform: 'darwin', arch: 'arm64', download: release.download });
    return { archive, manifest, release, run };
  }

  it('verifies the archive, then the executable inside it, and keeps it runnable', async () => {
    const { archive, manifest, run } = await darwin();
    expect(manifest.assets['darwin-arm64'].archiveSha256).not.toBe(manifest.assets['darwin-arm64'].executableSha256);
    expect(sha256(archive)).toBe(manifest.assets['darwin-arm64'].archiveSha256);
    await expect(run()).resolves.toMatchObject({ status: 'prepared', target: 'darwin-arm64' });
    expect(readFileSync(executable('darwin', 'arm64'))).toEqual(OFFICIAL_EXE);
    expect(readdirSync(path.join(root, 'darwin-arm64')).sort()).toEqual(['cloudflared', 'cloudflared.sha256']);
    if (process.platform !== 'win32') expect(statSync(executable('darwin', 'arm64')).mode & 0o111).not.toBe(0);
  });

  it('restores the executable permission of a valid cached binary', async () => {
    const { run } = await darwin();
    await run();
    if (process.platform !== 'win32') chmodSync(executable('darwin', 'arm64'), 0o644);
    await expect(run()).resolves.toMatchObject({ status: 'cached' });
    if (process.platform !== 'win32') expect(statSync(executable('darwin', 'arm64')).mode & 0o111).not.toBe(0);
  });

  it('rejects a modified cached executable together with a modified checksum file and re-extracts the official one', async () => {
    const { run } = await darwin();
    await run();
    await writeFile(executable('darwin', 'arm64'), 'attacker controlled');
    await writeFile(sidecar('darwin', 'arm64'), `${sha256('attacker controlled')}\n`);
    await expect(run()).resolves.toMatchObject({ status: 'prepared' });
    expect(readFileSync(executable('darwin', 'arm64'))).toEqual(OFFICIAL_EXE);
  });

  it('rejects a corrupted archive before anything is extracted', async () => {
    const { archive, manifest } = await darwin();
    const corrupted = Buffer.from(archive);
    corrupted[Math.floor(corrupted.length / 2)] ^= 0xff;
    const release = server({ [releaseUrl('cloudflared-darwin-arm64.tgz')]: corrupted, [LICENSE_URL]: LICENSE });
    await expect(prepareCloudflared({ manifest, root, platform: 'darwin', arch: 'arm64', download: release.download }))
      .rejects.toThrow('Official cloudflared asset checksum mismatch');
    expect(existsSync(path.join(root, 'darwin-arm64'))).toBe(false);
  });

  it('rejects an authentic-looking archive whose executable is not the pinned one and removes it', async () => {
    // The archive digest matches its pin, but the program inside is something else.
    const swapped = await makeTgz(Buffer.from('some other program'));
    const manifest = {
      version: VERSION,
      licenseSha256: sha256(LICENSE),
      assets: {
        'darwin-arm64': {
          name: 'cloudflared-darwin-arm64.tgz',
          archiveSha256: sha256(swapped),
          executableSha256: sha256(OFFICIAL_EXE),
        },
      },
    };
    const release = server({ [releaseUrl('cloudflared-darwin-arm64.tgz')]: swapped, [LICENSE_URL]: LICENSE });
    await expect(prepareCloudflared({ manifest, root, platform: 'darwin', arch: 'arm64', download: release.download }))
      .rejects.toThrow('Extracted cloudflared executable checksum mismatch');
    expect(existsSync(path.join(root, 'darwin-arm64'))).toBe(false);
  });

  it('reports an archive that does not contain the executable as a failure and removes the partial output', async () => {
    const directory = await mkdtemp(path.join(temporary, 'wrong-member-'));
    await writeFile(path.join(directory, 'something-else'), 'x');
    const archivePath = path.join(directory, 'asset.tgz');
    execFileSync('tar', ['-czf', archivePath, '-C', directory, 'something-else'], { stdio: 'ignore' });
    const archive = await readFile(archivePath);
    const manifest = {
      version: VERSION,
      licenseSha256: sha256(LICENSE),
      assets: { 'darwin-arm64': { name: 'cloudflared-darwin-arm64.tgz', archiveSha256: sha256(archive), executableSha256: sha256(OFFICIAL_EXE) } },
    };
    const release = server({ [releaseUrl('cloudflared-darwin-arm64.tgz')]: archive, [LICENSE_URL]: LICENSE });
    await expect(prepareCloudflared({
      manifest, root, platform: 'darwin', arch: 'arm64', download: release.download,
      extract: (file: string, directory: string) => { execFileSync('tar', ['-xzf', file, '-C', directory, 'cloudflared'], { stdio: 'ignore' }); },
    })).rejects.toThrow();
    expect(existsSync(path.join(root, 'darwin-arm64'))).toBe(false);
  });
});

describe('the shipped cloudflared manifest', () => {
  it('is complete for every supported target and for the license', () => {
    for (const target of Object.keys(integrity.assets)) {
      expect(() => pinnedAsset(integrity, target)).not.toThrow();
    }
    expect(() => pinnedAsset(integrity, 'linux-x64')).toThrow('unavailable for linux-x64');
  });
});
