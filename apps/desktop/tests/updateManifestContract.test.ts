import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { releaseTargets } from '../scripts/stageReleaseAssets.mjs';
import * as release from '../scripts/updateManifest.mjs';
import {
  assetKey,
  MAX_ASSET_BYTES,
  MAX_RELEASES_BYTES,
  MIN_ASSET_BYTES,
  parseUpdateManifest,
  selectAsset,
  selectPayload,
  SQUIRREL_RELEASES_NAME,
  UPDATE_MANIFEST_APP,
  UPDATE_MANIFEST_SCHEMA_VERSION,
} from '../src/update/manifest';
import { releaseAssetUrl, UPDATE_MANIFEST_FILE_NAME, UPDATE_REPOSITORY, productionEndpoints } from '../src/update/updateConfig';
import { compareVersions, parseVersion } from '../src/update/version';

/**
 * The release tooling (plain Node, `scripts/updateManifest.mjs`) writes the manifest; the app (TypeScript, `src/update/`)
 * reads it. They cannot share code, so this keeps them equal: the constants, the version comparison, and the shape.
 */
const repositoryRoot = path.resolve(process.cwd(), '../..');

describe('update manifest: release tooling and app agree', () => {
  it('share the identity constants', () => {
    expect(release.UPDATE_MANIFEST_SCHEMA_VERSION).toBe(UPDATE_MANIFEST_SCHEMA_VERSION);
    expect(release.UPDATE_MANIFEST_APP).toBe(UPDATE_MANIFEST_APP);
    expect(release.UPDATE_MANIFEST_FILE_NAME).toBe(UPDATE_MANIFEST_FILE_NAME);
    expect(release.UPDATE_REPOSITORY).toBe(UPDATE_REPOSITORY);
    expect(release.MIN_ASSET_BYTES).toBe(MIN_ASSET_BYTES);
    expect(release.MAX_ASSET_BYTES).toBe(MAX_ASSET_BYTES);
    expect(release.MAX_RELEASES_BYTES).toBe(MAX_RELEASES_BYTES);
    expect(release.SQUIRREL_RELEASES_NAME).toBe(SQUIRREL_RELEASES_NAME);
  });

  it('compare versions the same way, including pre-releases and build metadata', () => {
    const versions = [
      '0.9.0', '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1',
      '1.0.0', '1.0.0+build.1', '1.0.1', '1.1.0', '1.1.1', '1.2.0-rc.1', '1.2.0', '1.10.0', '2.0.0',
    ];
    for (const left of versions) {
      for (const right of versions) {
        expect(Math.sign(release.compareVersions(left, right)), `${left} vs ${right}`).toBe(Math.sign(compareVersions(left, right)));
      }
    }
  });

  it('accept and refuse the same strings as versions', () => {
    for (const value of ['1.2.3', '1.2.3-rc.1', '1.2.3+b', '01.2.3', '1.2', 'v1.2.3', '', '1.2.3-', '1.2.3.4', 'latest', '99999999999999999999.0.0']) {
      expect(release.parseVersion(value) !== undefined, value).toBe(parseVersion(value) !== undefined);
    }
  });

  it('write a manifest that the app reads, for every release target and the platform keys the app computes', () => {
    const targets = releaseTargets('1.2.0');
    const assets = Object.fromEntries(targets.map((target, index) => [
      release.assetKeyOf(target.platform, target.architecture),
      {
        name: target.assetName,
        size: MIN_ASSET_BYTES + index,
        sha256: `${index}`.repeat(64).slice(0, 64).replaceAll(/[^0-9a-f]/gu, 'a'),
        ...(target.squirrel
          ? {
              squirrel: {
                releases: { name: target.squirrel.releasesName, size: 96, sha256: 'c'.repeat(64) },
                package: { name: target.squirrel.packageName, size: MIN_ASSET_BYTES + 7, sha256: 'd'.repeat(64) },
              },
            }
          : {}),
      },
    ]));
    const manifest = release.buildUpdateManifest({ version: '1.2.0', policy: { minimumSupportedVersion: '1.1.0' }, assets });

    const parsed = parseUpdateManifest(JSON.parse(JSON.stringify(manifest)));

    expect(parsed.version).toBe('1.2.0');
    expect(parsed.minimumSupportedVersion).toBe('1.1.0');
    for (const target of targets) {
      expect(release.assetKeyOf(target.platform, target.architecture)).toBe(assetKey(target.platform, target.architecture));
      expect(selectAsset(parsed, target.platform, target.architecture)?.name).toBe(target.assetName);
    }
  });

  it('write the Squirrel payload of the Windows installer the way the app asks for it, and none for macOS', () => {
    const targets = releaseTargets('1.2.0');
    const [windows] = targets;
    expect(windows.platform).toBe('win32');
    expect(windows.squirrel).toEqual({ releasesName: 'RELEASES', packageName: 'own_the_block-1.2.0-full.nupkg' });
    expect(targets.filter(target => target.platform === 'darwin').every(target => target.squirrel === undefined)).toBe(true);

    const manifest = release.buildUpdateManifest({
      version: '1.2.0',
      policy: { minimumSupportedVersion: '1.0.0' },
      assets: {
        'win32-x64': {
          name: windows.assetName,
          size: MIN_ASSET_BYTES,
          sha256: 'a'.repeat(64),
          squirrel: {
            releases: { name: windows.squirrel!.releasesName, size: 96, sha256: 'c'.repeat(64) },
            package: { name: windows.squirrel!.packageName, size: MIN_ASSET_BYTES + 7, sha256: 'd'.repeat(64) },
          },
        },
      },
    });
    const asset = selectAsset(parseUpdateManifest(JSON.parse(JSON.stringify(manifest))), 'win32', 'x64')!;
    const payload = selectPayload(asset, 'squirrel');

    expect(payload?.files.map(file => file.name)).toEqual(['RELEASES', 'own_the_block-1.2.0-full.nupkg']);
    expect(payload?.main.name).toBe('own_the_block-1.2.0-full.nupkg');
  });

  it('name the Squirrel package the way the maker in forge.config.cjs names it', () => {
    const forgeConfig = readFileSync(path.join(process.cwd(), 'forge.config.cjs'), 'utf8');
    const squirrelName = /name: '@electron-forge\/maker-squirrel'[\s\S]*?name: '([a-z_]+)'/u.exec(forgeConfig)?.[1];

    expect(squirrelName).toBeDefined();
    expect(releaseTargets('1.2.0')[0].squirrel?.packageName).toBe(`${squirrelName!}-1.2.0-full.nupkg`);
  });

  it('name the installer files the way the download URL and a file on disk need', () => {
    for (const target of releaseTargets('1.2.0')) {
      expect(target.assetName).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
      expect(releaseAssetUrl('1.2.0', target.assetName))
        .toBe(`https://github.com/tvghung/monopoly/releases/download/v1.2.0/${target.assetName}`);
    }
  });

  it('point the app at the latest release of the repository that publishes the manifest', () => {
    expect(productionEndpoints().manifestUrl)
      .toBe('https://github.com/tvghung/monopoly/releases/latest/download/update-manifest.json');
  });

  it('refuse a manifest the app would refuse, instead of publishing it', () => {
    const good = { name: 'OwnTheBlock-1.2.0-win32-x64-Setup.exe', size: MIN_ASSET_BYTES, sha256: 'a'.repeat(64) };
    const build = (asset: Record<string, unknown>, key = 'win32-x64') => release.buildUpdateManifest({
      version: '1.2.0', policy: { minimumSupportedVersion: '1.0.0' }, assets: { [key]: asset },
    });

    expect(() => build(good)).not.toThrow();
    expect(() => build({ ...good, name: 'a b.exe' })).toThrow(/unsafe file name/);
    expect(() => build({ ...good, name: '../Setup.exe' })).toThrow(/unsafe file name/);
    expect(() => build({ ...good, size: MIN_ASSET_BYTES - 1 })).toThrow(/implausible size/);
    expect(() => build({ ...good, size: MAX_ASSET_BYTES + 1 })).toThrow(/implausible size/);
    expect(() => build({ ...good, sha256: 'A'.repeat(64) })).toThrow(/SHA-256/);
    expect(() => build(good, 'win32')).toThrow(/platform-architecture/);
    expect(() => release.buildUpdateManifest({ version: '1.2.0', policy: { minimumSupportedVersion: '1.0.0' }, assets: {} }))
      .toThrow(/at least one installer/);
    expect(() => release.buildUpdateManifest({ version: 'v1.2.0', policy: { minimumSupportedVersion: '1.0.0' }, assets: { 'win32-x64': good } }))
      .toThrow(/not a semantic version/);
  });

  it('refuse a Squirrel payload the app would refuse, instead of publishing it', () => {
    const releases = { name: 'RELEASES', size: 96, sha256: 'c'.repeat(64) };
    const pkg = { name: 'own_the_block-1.2.0-full.nupkg', size: MIN_ASSET_BYTES, sha256: 'd'.repeat(64) };
    const setup = { name: 'OwnTheBlock-1.2.0-win32-x64-Setup.exe', size: MIN_ASSET_BYTES, sha256: 'a'.repeat(64) };
    const build = (squirrel: unknown) => release.buildUpdateManifest({
      version: '1.2.0', policy: { minimumSupportedVersion: '1.0.0' }, assets: { 'win32-x64': { ...setup, squirrel } },
    });

    expect(() => build({ releases, package: pkg })).not.toThrow();
    expect(() => build('RELEASES')).toThrow(/malformed Squirrel payload/);
    expect(() => build({ package: pkg })).toThrow(/RELEASES file of .* must be an object/);
    expect(() => build({ releases })).toThrow(/Squirrel package of .* must be an object/);
    expect(() => build({ releases: { ...releases, name: 'RELEASES.txt' }, package: pkg })).toThrow(/unsafe file name/);
    expect(() => build({ releases: { ...releases, size: 0 }, package: pkg })).toThrow(/implausible size/);
    expect(() => build({ releases: { ...releases, size: MAX_RELEASES_BYTES + 1 }, package: pkg })).toThrow(/implausible size/);
    expect(() => build({ releases, package: { ...pkg, name: 'package.zip' } })).toThrow(/unsafe file name/);
    expect(() => build({ releases, package: { ...pkg, size: MIN_ASSET_BYTES - 1 } })).toThrow(/implausible size/);
    expect(() => build({ releases, package: { ...pkg, sha256: 'nope' } })).toThrow(/SHA-256/);
  });
});

describe('update policy of this repository', () => {
  it('is a valid policy that does not make the current release mandatory for itself', () => {
    const policy = release.readUpdatePolicy(repositoryRoot);
    const { version } = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')) as { version: string };

    expect(release.parseVersion(policy.minimumSupportedVersion)).toBeDefined();
    expect(release.compareVersions(policy.minimumSupportedVersion, version)).toBeLessThanOrEqual(0);
  });

  it('refuses a missing file and a policy that is not a semantic version', () => {
    expect(() => release.readUpdatePolicy(path.join(repositoryRoot, 'apps'))).toThrow(/Could not read/);
    expect(() => release.validateUpdatePolicy({ minimumSupportedVersion: 'soon' })).toThrow(/semantic version/);
    expect(() => release.validateUpdatePolicy([])).toThrow(/JSON object/);
    expect(() => release.validateUpdatePolicy(null)).toThrow(/JSON object/);
  });
});
