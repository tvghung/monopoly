import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CHECKSUM_FILE_NAME,
  releaseTargets,
  stageReleaseAssets,
} from '../scripts/stageReleaseAssets.mjs';

const VERSION = '1.0.0';

interface FakeTarget {
  artifact: string;
  platform: 'win32' | 'darwin';
  architecture: 'x64' | 'arm64';
  installerDirectory: string;
  installerName: string;
  /** Other files the real build leaves next to the installer; none of them belongs on the release page. */
  siblings: string[];
}

const FAKE_TARGETS: FakeTarget[] = [
  {
    artifact: 'own-the-block-windows-x64',
    platform: 'win32',
    architecture: 'x64',
    installerDirectory: path.join('make', 'squirrel.windows', 'x64'),
    installerName: `OwnTheBlock-${VERSION}-win32-x64-Setup.exe`,
    siblings: ['RELEASES', `own_the_block-${VERSION}-full.nupkg`],
  },
  {
    artifact: 'own-the-block-macos-x64',
    platform: 'darwin',
    architecture: 'x64',
    installerDirectory: 'make',
    installerName: `Own the Block-${VERSION}-x64.dmg`,
    siblings: [],
  },
  {
    artifact: 'own-the-block-macos-arm64',
    platform: 'darwin',
    architecture: 'arm64',
    installerDirectory: 'make',
    installerName: `Own the Block-${VERSION}-arm64.dmg`,
    siblings: [],
  },
];

const sha256 = (content: string) => createHash('sha256').update(content).digest('hex');
const contentOf = (target: FakeTarget, fileName: string) => `${target.artifact}:${fileName}`;

let workspace: string;
let artifactsDirectory: string;
let outputDirectory: string;

async function writeManifest(target: FakeTarget, overrides: Record<string, unknown> = {}) {
  const fileNames = [target.installerName, ...target.siblings];
  const manifest = {
    version: VERSION,
    productName: 'Own the Block',
    executableName: 'OwnTheBlock',
    platform: target.platform,
    architecture: target.architecture,
    signing: { mode: 'unsigned-validation', signing: 'BLOCKED', notarization: 'NOT RUN' },
    artifacts: fileNames.map(fileName => ({
      path: `apps/desktop/out/${path.posix.join(...target.installerDirectory.split(path.sep), fileName)}`,
      bytes: contentOf(target, fileName).length,
      sha256: sha256(contentOf(target, fileName)),
    })),
    ...overrides,
  };
  const directory = path.join(artifactsDirectory, target.artifact, 'release-artifacts');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFile(path.join(directory, 'SHA256SUMS'), 'not used by the staging step\n', 'utf8');
}

async function writeTarget(target: FakeTarget) {
  const directory = path.join(artifactsDirectory, target.artifact, target.installerDirectory);
  await mkdir(directory, { recursive: true });
  for (const fileName of [target.installerName, ...target.siblings]) {
    await writeFile(path.join(directory, fileName), contentOf(target, fileName), 'utf8');
  }
  await writeManifest(target);
}

const stage = (version = VERSION) => stageReleaseAssets({ artifactsDirectory, outputDirectory, version });

beforeEach(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-stage-'));
  artifactsDirectory = path.join(workspace, 'release-assets');
  outputDirectory = path.join(workspace, 'release-upload');
  for (const target of FAKE_TARGETS) await writeTarget(target);
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('release asset staging', () => {
  it('names the three installers after the version and the target, without spaces', () => {
    expect(releaseTargets(VERSION).map(target => target.assetName)).toEqual([
      'OwnTheBlock-1.0.0-win32-x64-Setup.exe',
      'OwnTheBlock-1.0.0-macos-x64.dmg',
      'OwnTheBlock-1.0.0-macos-arm64.dmg',
    ]);
  });

  it('stages only the installers plus one checksum file, with the bytes untouched', async () => {
    const staged = await stage();

    expect((await readdir(outputDirectory)).sort()).toEqual([
      'OwnTheBlock-1.0.0-macos-arm64.dmg',
      'OwnTheBlock-1.0.0-macos-x64.dmg',
      'OwnTheBlock-1.0.0-win32-x64-Setup.exe',
      CHECKSUM_FILE_NAME,
    ]);
    for (const [index, target] of FAKE_TARGETS.entries()) {
      const asset = staged[index];
      expect(await readFile(path.join(outputDirectory, asset.name), 'utf8')).toBe(contentOf(target, target.installerName));
      expect(asset.sha256).toBe(sha256(contentOf(target, target.installerName)));
      expect(asset.bytes).toBe(contentOf(target, target.installerName).length);
    }
  });

  it('writes a SHA256SUMS.txt that names the staged files', async () => {
    const staged = await stage();

    const checksums = await readFile(path.join(outputDirectory, CHECKSUM_FILE_NAME), 'utf8');
    expect(checksums).toBe(`${staged.map(asset => `${asset.sha256}  ${asset.name}`).join('\n')}\n`);
    expect(checksums.split('\n').filter(Boolean)).toHaveLength(3);
  });

  it('reports the signing state its build jobs recorded', async () => {
    const staged = await stage();

    expect(staged.map(asset => asset.signing)).toEqual(['BLOCKED', 'BLOCKED', 'BLOCKED']);
  });

  it('starts from an empty output directory', async () => {
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, 'left-over.txt'), 'stale', 'utf8');

    await stage();

    expect(await readdir(outputDirectory)).not.toContain('left-over.txt');
  });

  it('fails when a target did not upload its artifact', async () => {
    await rm(path.join(artifactsDirectory, 'own-the-block-macos-arm64'), { recursive: true, force: true });

    await expect(stage()).rejects.toThrow(/macOS arm64: artifact own-the-block-macos-arm64 was not downloaded/);
  });

  it('fails when a target holds two installers', async () => {
    const [, macos] = FAKE_TARGETS;
    await writeFile(path.join(artifactsDirectory, macos.artifact, 'make', 'Another.dmg'), 'second', 'utf8');

    await expect(stage()).rejects.toThrow(/macOS x64: expected exactly one installer .* found 2/);
  });

  it('fails when the Windows installer is not the expected Setup executable', async () => {
    const [windows] = FAKE_TARGETS;
    await rm(path.join(artifactsDirectory, windows.artifact, windows.installerDirectory, windows.installerName));

    await expect(stage()).rejects.toThrow(/Windows x64: expected exactly one installer .* found 0/);
  });

  it('fails when an installer differs from the checksum its build job recorded', async () => {
    const [windows] = FAKE_TARGETS;
    await writeFile(
      path.join(artifactsDirectory, windows.artifact, windows.installerDirectory, windows.installerName),
      'altered after the build',
      'utf8',
    );

    await expect(stage()).rejects.toThrow(/Windows x64: .*Setup\.exe does not match the checksum/);
  });

  it('fails when an installer is missing from the manifest', async () => {
    const [, macos] = FAKE_TARGETS;
    await writeManifest(macos, { artifacts: [] });

    await expect(stage()).rejects.toThrow(/macOS x64: .*\.dmg is not listed in manifest\.json/);
  });

  it('fails when the manifest belongs to another version, platform or architecture', async () => {
    const [, macos, arm] = FAKE_TARGETS;
    await writeManifest(macos, { version: '0.9.0' });
    await expect(stage()).rejects.toThrow(/macOS x64: manifest describes 0\.9\.0 darwin x64, expected 1\.0\.0 darwin x64/);

    await writeManifest(macos);
    await writeManifest(arm, { architecture: 'x64' });
    await expect(stage()).rejects.toThrow(/macOS arm64: manifest describes 1\.0\.0 darwin x64, expected 1\.0\.0 darwin arm64/);
  });

  it('fails when a target has no manifest', async () => {
    const [windows] = FAKE_TARGETS;
    await rm(path.join(artifactsDirectory, windows.artifact, 'release-artifacts'), { recursive: true, force: true });

    await expect(stage()).rejects.toThrow(/Windows x64: expected exactly one manifest\.json .* found 0/);
  });

  it('refuses a version that still carries the tag prefix', async () => {
    await expect(stage('v1.0.0')).rejects.toThrow(/semantic version without the leading "v"/);
  });
});
