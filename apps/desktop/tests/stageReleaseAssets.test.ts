import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CHECKSUM_FILE_NAME,
  parseReleasesFile,
  releaseTargets,
  stageReleaseAssets,
} from '../scripts/stageReleaseAssets.mjs';
import { MIN_ASSET_BYTES, UPDATE_MANIFEST_FILE_NAME } from '../scripts/updateManifest.mjs';
import { parseUpdateManifest, selectAsset, selectPayload } from '../src/update/manifest';

const VERSION = '1.0.0';
const POLICY = { minimumSupportedVersion: '1.0.0' };
const PACKAGE_NAME = `own_the_block-${VERSION}-full.nupkg`;

interface FakeTarget {
  artifact: string;
  platform: 'win32' | 'darwin';
  architecture: 'x64' | 'arm64';
  installerDirectory: string;
  installerName: string;
  /** Other files the real build leaves next to the installer. For Windows these are the Squirrel feed; the rest is not published. */
  siblings: string[];
}

const FAKE_TARGETS: FakeTarget[] = [
  {
    artifact: 'own-the-block-windows-x64',
    platform: 'win32',
    architecture: 'x64',
    installerDirectory: path.join('make', 'squirrel.windows', 'x64'),
    installerName: `OwnTheBlock-${VERSION}-win32-x64-Setup.exe`,
    siblings: ['RELEASES', PACKAGE_NAME],
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

const hashOf = (algorithm: 'sha1' | 'sha256', content: string) => createHash(algorithm).update(content).digest('hex');
const sha256 = (content: string) => hashOf('sha256', content);
// An installer below the size the updater accepts would be refused by it, so the fake files are as large as the smallest real one.
const bodyOf = (target: FakeTarget, fileName: string) => `${target.artifact}:${fileName}:${'x'.repeat(MIN_ASSET_BYTES)}`;
/** What Squirrel writes next to its package: a byte order mark, then "<SHA-1 of the package> <name> <size>", no final newline. */
const releasesFor = (target: FakeTarget) => {
  const body = bodyOf(target, PACKAGE_NAME);
  return `\u{feff}${hashOf('sha1', body).toUpperCase()} ${PACKAGE_NAME} ${body.length}`;
};
const contentOf = (target: FakeTarget, fileName: string) => (fileName === 'RELEASES' ? releasesFor(target) : bodyOf(target, fileName));

let workspace: string;
let artifactsDirectory: string;
let outputDirectory: string;

const artifactEntry = (target: FakeTarget, fileName: string, content = contentOf(target, fileName)) => ({
  path: `apps/desktop/out/${path.posix.join(...target.installerDirectory.split(path.sep), fileName)}`,
  bytes: content.length,
  sha256: sha256(content),
});

async function writeManifest(target: FakeTarget, overrides: Record<string, unknown> = {}) {
  const fileNames = [target.installerName, ...target.siblings];
  const manifest = {
    version: VERSION,
    productName: 'Own the Block',
    executableName: 'OwnTheBlock',
    platform: target.platform,
    architecture: target.architecture,
    signing: { mode: 'unsigned-validation', signing: 'BLOCKED', notarization: 'NOT RUN' },
    artifacts: fileNames.map(fileName => artifactEntry(target, fileName)),
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

/** Replaces one file of a target and records the new content in its build manifest, as a build job would have. */
async function replaceFile(target: FakeTarget, fileName: string, content: string) {
  await writeFile(path.join(artifactsDirectory, target.artifact, target.installerDirectory, fileName), content, 'utf8');
  await writeManifest(target, {
    artifacts: [target.installerName, ...target.siblings].map(name => artifactEntry(target, name, name === fileName ? content : undefined)),
  });
}

const stage = (version = VERSION, policy = POLICY) => stageReleaseAssets({ artifactsDirectory, outputDirectory, version, policy });
const [WINDOWS, MACOS_X64, MACOS_ARM] = FAKE_TARGETS;

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

  it('stages the installers, the Windows Squirrel feed, the checksum file and the update manifest, with the bytes untouched', async () => {
    const staged = await stage();

    expect((await readdir(outputDirectory)).sort()).toEqual([
      'OwnTheBlock-1.0.0-macos-arm64.dmg',
      'OwnTheBlock-1.0.0-macos-x64.dmg',
      'OwnTheBlock-1.0.0-win32-x64-Setup.exe',
      PACKAGE_NAME,
      'RELEASES',
      CHECKSUM_FILE_NAME,
      UPDATE_MANIFEST_FILE_NAME,
    ].sort());
    for (const [index, target] of FAKE_TARGETS.entries()) {
      const asset = staged[index];
      expect(await readFile(path.join(outputDirectory, asset.name), 'utf8')).toBe(contentOf(target, target.installerName));
      expect(asset.sha256).toBe(sha256(contentOf(target, target.installerName)));
      expect(asset.bytes).toBe(contentOf(target, target.installerName).length);
    }
    // The feed files are copied as they are, byte for byte (the byte order mark of RELEASES included).
    expect(await readFile(path.join(outputDirectory, 'RELEASES'), 'utf8')).toBe(releasesFor(WINDOWS));
    expect(await readFile(path.join(outputDirectory, PACKAGE_NAME), 'utf8')).toBe(bodyOf(WINDOWS, PACKAGE_NAME));
  });

  it('writes a SHA256SUMS.txt that names every staged file except itself and the manifest', async () => {
    const staged = await stage();

    const checksums = await readFile(path.join(outputDirectory, CHECKSUM_FILE_NAME), 'utf8');
    expect(checksums).toBe(`${staged.flatMap(asset => asset.files).map(file => `${file.sha256}  ${file.name}`).join('\n')}\n`);
    expect(checksums.split('\n').filter(Boolean)).toHaveLength(5);
    expect(checksums).toContain(`${sha256(releasesFor(WINDOWS))}  RELEASES`);
    expect(checksums).toContain(`${sha256(bodyOf(WINDOWS, PACKAGE_NAME))}  ${PACKAGE_NAME}`);
  });

  describe('update manifest', () => {
    it('lists every staged installer, and the Windows Squirrel files, with the size and checksum of the staged bytes, and nothing else', async () => {
      const staged = await stage();

      const manifest = JSON.parse(await readFile(path.join(outputDirectory, UPDATE_MANIFEST_FILE_NAME), 'utf8')) as unknown;
      expect(manifest).toEqual({
        schemaVersion: 1,
        app: 'own-the-block',
        version: VERSION,
        minimumSupportedVersion: '1.0.0',
        assets: {
          'win32-x64': {
            name: staged[0].name,
            size: staged[0].bytes,
            sha256: staged[0].sha256,
            squirrel: {
              // The byte order mark is three bytes on disk, not one character.
              releases: { name: 'RELEASES', size: Buffer.byteLength(releasesFor(WINDOWS)), sha256: sha256(releasesFor(WINDOWS)) },
              package: { name: PACKAGE_NAME, size: bodyOf(WINDOWS, PACKAGE_NAME).length, sha256: sha256(bodyOf(WINDOWS, PACKAGE_NAME)) },
            },
          },
          'darwin-x64': { name: staged[1].name, size: staged[1].bytes, sha256: staged[1].sha256 },
          'darwin-arm64': { name: staged[2].name, size: staged[2].bytes, sha256: staged[2].sha256 },
        },
      });
    });

    it('is read by the app as the installer of each of its three targets, and the Squirrel feed of Windows', async () => {
      const staged = await stage();

      const manifest = parseUpdateManifest(JSON.parse(await readFile(path.join(outputDirectory, UPDATE_MANIFEST_FILE_NAME), 'utf8')));
      expect(selectAsset(manifest, 'win32', 'x64')?.name).toBe(staged[0].name);
      expect(selectAsset(manifest, 'darwin', 'x64')?.name).toBe(staged[1].name);
      expect(selectAsset(manifest, 'darwin', 'arm64')?.name).toBe(staged[2].name);
      expect(selectPayload(selectAsset(manifest, 'win32', 'x64')!, 'squirrel')?.files.map(file => file.name)).toEqual(['RELEASES', PACKAGE_NAME]);
      expect(selectPayload(selectAsset(manifest, 'darwin', 'arm64')!, 'squirrel')).toBeUndefined();
    });

    it('carries the minimum supported version of the release policy', async () => {
      await stage(VERSION, { minimumSupportedVersion: '0.9.0' });

      const manifest = JSON.parse(await readFile(path.join(outputDirectory, UPDATE_MANIFEST_FILE_NAME), 'utf8')) as { minimumSupportedVersion: string };
      expect(manifest.minimumSupportedVersion).toBe('0.9.0');
    });

    it('refuses a policy whose minimum supported version is newer than the release', async () => {
      await expect(stage(VERSION, { minimumSupportedVersion: '1.0.1' })).rejects.toThrow(/newer than the release 1\.0\.0/);
    });

    it('refuses a policy that is not a semantic version', async () => {
      await expect(stage(VERSION, { minimumSupportedVersion: 'old' })).rejects.toThrow(/semantic version/);
    });

    it('refuses an installer so small that the app would refuse the manifest', async () => {
      await replaceFile(MACOS_X64, MACOS_X64.installerName, 'tiny installer');

      await expect(stage()).rejects.toThrow(/implausible size/);
    });
  });

  describe('Squirrel feed of the Windows build', () => {
    it('fails when RELEASES is missing from the build', async () => {
      await rm(path.join(artifactsDirectory, WINDOWS.artifact, WINDOWS.installerDirectory, 'RELEASES'));

      await expect(stage()).rejects.toThrow(/Windows x64: expected exactly one RELEASES in .* found 0/);
    });

    it('fails when the full package is missing from the build', async () => {
      await rm(path.join(artifactsDirectory, WINDOWS.artifact, WINDOWS.installerDirectory, PACKAGE_NAME));

      await expect(stage()).rejects.toThrow(/Windows x64: expected exactly one own_the_block-1\.0\.0-full\.nupkg in .* found 0/);
    });

    it('fails when the full package is not the one of this version', async () => {
      const stale = path.join(artifactsDirectory, WINDOWS.artifact, WINDOWS.installerDirectory, 'own_the_block-0.9.0-full.nupkg');
      await rm(path.join(artifactsDirectory, WINDOWS.artifact, WINDOWS.installerDirectory, PACKAGE_NAME));
      await writeFile(stale, 'an older build', 'utf8');

      await expect(stage()).rejects.toThrow(/Windows x64: expected exactly one own_the_block-1\.0\.0-full\.nupkg/);
    });

    it('fails when a feed file differs from the checksum its build job recorded', async () => {
      await writeFile(path.join(artifactsDirectory, WINDOWS.artifact, WINDOWS.installerDirectory, PACKAGE_NAME), 'altered after the build', 'utf8');

      await expect(stage()).rejects.toThrow(/Windows x64: .*full\.nupkg does not match the checksum/);
    });

    it('fails when a feed file is missing from the manifest of its build job', async () => {
      await writeManifest(WINDOWS, { artifacts: [artifactEntry(WINDOWS, WINDOWS.installerName), artifactEntry(WINDOWS, 'RELEASES')] });

      await expect(stage()).rejects.toThrow(/Windows x64: .*full\.nupkg is not listed in manifest\.json/);
    });

    it('fails when RELEASES describes another package than the one built with it', async () => {
      const other = `\u{feff}${hashOf('sha1', 'other').toUpperCase()} ${PACKAGE_NAME} ${bodyOf(WINDOWS, PACKAGE_NAME).length}`;
      await replaceFile(WINDOWS, 'RELEASES', other);

      await expect(stage()).rejects.toThrow(/RELEASES does not describe own_the_block-1\.0\.0-full\.nupkg/);
    });

    it('fails when RELEASES names or sizes the package differently', async () => {
      const sha1 = hashOf('sha1', bodyOf(WINDOWS, PACKAGE_NAME)).toUpperCase();
      await replaceFile(WINDOWS, 'RELEASES', `\u{feff}${sha1} own_the_block-0.9.0-full.nupkg ${bodyOf(WINDOWS, PACKAGE_NAME).length}`);
      await expect(stage()).rejects.toThrow(/RELEASES does not describe/);

      await replaceFile(WINDOWS, 'RELEASES', `\u{feff}${sha1} ${PACKAGE_NAME} 12`);
      await expect(stage()).rejects.toThrow(/RELEASES does not describe/);
    });

    it('fails when RELEASES lists more than the one full package (the app would not ship the deltas it asks for)', async () => {
      const sha1 = hashOf('sha1', bodyOf(WINDOWS, PACKAGE_NAME)).toUpperCase();
      await replaceFile(
        WINDOWS,
        'RELEASES',
        `\u{feff}${sha1} ${PACKAGE_NAME} ${bodyOf(WINDOWS, PACKAGE_NAME).length}\r\n${sha1} own_the_block-1.0.0-delta.nupkg 1234`,
      );

      await expect(stage()).rejects.toThrow(/RELEASES is not a usable Squirrel feed: expected exactly one package line, found 2/);
    });

    it('fails when RELEASES is not a Squirrel feed at all', async () => {
      await replaceFile(WINDOWS, 'RELEASES', '<html>404</html>');

      await expect(stage()).rejects.toThrow(/RELEASES is not a usable Squirrel feed: the package line is not/);
    });
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
    await writeFile(path.join(artifactsDirectory, MACOS_X64.artifact, 'make', 'Another.dmg'), 'second', 'utf8');

    await expect(stage()).rejects.toThrow(/macOS x64: expected exactly one installer .* found 2/);
  });

  it('fails when the Windows installer is not the expected Setup executable', async () => {
    await rm(path.join(artifactsDirectory, WINDOWS.artifact, WINDOWS.installerDirectory, WINDOWS.installerName));

    await expect(stage()).rejects.toThrow(/Windows x64: expected exactly one installer .* found 0/);
  });

  it('fails when an installer differs from the checksum its build job recorded', async () => {
    await writeFile(
      path.join(artifactsDirectory, WINDOWS.artifact, WINDOWS.installerDirectory, WINDOWS.installerName),
      'altered after the build',
      'utf8',
    );

    await expect(stage()).rejects.toThrow(/Windows x64: .*Setup\.exe does not match the checksum/);
  });

  it('fails when an installer is missing from the manifest', async () => {
    await writeManifest(MACOS_X64, { artifacts: [] });

    await expect(stage()).rejects.toThrow(/macOS x64: .*\.dmg is not listed in manifest\.json/);
  });

  it('fails when the manifest belongs to another version, platform or architecture', async () => {
    await writeManifest(MACOS_X64, { version: '0.9.0' });
    await expect(stage()).rejects.toThrow(/macOS x64: manifest describes 0\.9\.0 darwin x64, expected 1\.0\.0 darwin x64/);

    await writeManifest(MACOS_X64);
    await writeManifest(MACOS_ARM, { architecture: 'x64' });
    await expect(stage()).rejects.toThrow(/macOS arm64: manifest describes 1\.0\.0 darwin x64, expected 1\.0\.0 darwin arm64/);
  });

  it('fails when a target has no manifest', async () => {
    await rm(path.join(artifactsDirectory, WINDOWS.artifact, 'release-artifacts'), { recursive: true, force: true });

    await expect(stage()).rejects.toThrow(/Windows x64: expected exactly one manifest\.json .* found 0/);
  });

  it('refuses a version that still carries the tag prefix', async () => {
    await expect(stage('v1.0.0')).rejects.toThrow(/semantic version without the leading "v"/);
  });
});

describe('RELEASES file reading', () => {
  const SHA1 = 'AB'.repeat(20);

  it('reads the one line Squirrel writes, with its byte order mark, in either case and with or without a final newline', () => {
    const expected = { sha1: SHA1.toLowerCase(), name: 'own_the_block-1.0.0-full.nupkg', size: 168_278_535 };

    expect(parseReleasesFile(`\u{feff}${SHA1} own_the_block-1.0.0-full.nupkg 168278535`)).toEqual(expected);
    expect(parseReleasesFile(`${SHA1.toLowerCase()} own_the_block-1.0.0-full.nupkg 168278535\r\n`)).toEqual(expected);
    expect(parseReleasesFile(`\n${SHA1} own_the_block-1.0.0-full.nupkg 168278535\n\n`)).toEqual(expected);
  });

  it.each([
    ['nothing', '', /found 0/],
    ['two packages', `${SHA1} a-full.nupkg 10\n${SHA1} a-delta.nupkg 5`, /found 2/],
    ['a short checksum', 'ABCD a-full.nupkg 10', /is not "<SHA-1>/],
    ['no size', `${SHA1} a-full.nupkg`, /is not "<SHA-1>/],
    ['a name with a space', `${SHA1} a full.nupkg 10`, /is not "<SHA-1>/],
    ['a partial-rollout marker', `${SHA1} a-full.nupkg 10# 50%`, /is not "<SHA-1>/],
  ])('refuses %s', (_label, text, pattern) => {
    expect(() => parseReleasesFile(text)).toThrow(pattern);
  });
});
