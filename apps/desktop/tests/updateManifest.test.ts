import { describe, expect, it } from 'vitest';
import {
  assetKey,
  isMandatoryUpdate,
  MAX_ASSET_BYTES,
  MAX_RELEASES_BYTES,
  MIN_ASSET_BYTES,
  parseUpdateManifest,
  selectAsset,
  selectPayload,
  UpdateManifestError,
} from '../src/update/manifest';

const SHA = 'a'.repeat(64);

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    app: 'own-the-block',
    version: '1.2.0',
    minimumSupportedVersion: '1.1.0',
    assets: {
      'win32-x64': { name: 'OwnTheBlock-1.2.0-win32-x64-Setup.exe', size: 168_398_848, sha256: SHA },
      'darwin-arm64': { name: 'OwnTheBlock-1.2.0-macos-arm64.dmg', size: 181_756_558, sha256: 'b'.repeat(64) },
    },
    ...overrides,
  };
}

function expectInvalid(raw: unknown, pattern: RegExp): void {
  let caught: unknown;
  try {
    parseUpdateManifest(raw);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(UpdateManifestError);
  expect((caught as UpdateManifestError).code).toBe('MANIFEST_INVALID');
  expect((caught as UpdateManifestError).message).toMatch(pattern);
}

describe('update manifest', () => {
  it('reads a valid manifest down to exactly the fields the updater uses', () => {
    expect(parseUpdateManifest(manifest())).toEqual({
      version: '1.2.0',
      minimumSupportedVersion: '1.1.0',
      assets: {
        'win32-x64': { name: 'OwnTheBlock-1.2.0-win32-x64-Setup.exe', size: 168_398_848, sha256: SHA },
        'darwin-arm64': { name: 'OwnTheBlock-1.2.0-macos-arm64.dmg', size: 181_756_558, sha256: 'b'.repeat(64) },
      },
    });
  });

  it('ignores fields it does not know, so a later release can add information', () => {
    const parsed = parseUpdateManifest(manifest({
      notes: 'ignored',
      assets: { 'win32-x64': { name: 'a.exe', size: MIN_ASSET_BYTES, sha256: SHA, signature: 'ignored' } },
    }));
    expect(Object.keys(parsed.assets)).toEqual(['win32-x64']);
    expect(parsed.assets['win32-x64']).toEqual({ name: 'a.exe', size: MIN_ASSET_BYTES, sha256: SHA });
  });

  it('refuses anything that is not a JSON object', () => {
    for (const raw of [null, undefined, 'text', 12, [], [manifest()]]) expectInvalid(raw, /JSON object/);
  });

  it('refuses a manifest of another application', () => {
    expectInvalid(manifest({ app: 'something-else' }), /not for this application/);
    expectInvalid(manifest({ app: undefined }), /not for this application/);
  });

  it('separates a manifest of a newer schema from a broken one', () => {
    let caught: unknown;
    try {
      parseUpdateManifest(manifest({ schemaVersion: 2 }));
    } catch (error) {
      caught = error;
    }
    expect((caught as UpdateManifestError).code).toBe('MANIFEST_UNSUPPORTED');

    for (const schemaVersion of [undefined, 0, -1, 1.5, '1', null]) expectInvalid(manifest({ schemaVersion }), /schema version/);
  });

  it('requires semantic versions, with the minimum supported version not above the release', () => {
    expectInvalid(manifest({ version: 'v1.2.0' }), /release version/);
    expectInvalid(manifest({ version: undefined }), /release version/);
    expectInvalid(manifest({ minimumSupportedVersion: 'old' }), /minimum supported version is not/);
    expectInvalid(manifest({ minimumSupportedVersion: undefined }), /minimum supported version is not/);
    expectInvalid(manifest({ minimumSupportedVersion: '1.3.0' }), /newer than the release/);
    expect(parseUpdateManifest(manifest({ minimumSupportedVersion: '1.2.0' })).minimumSupportedVersion).toBe('1.2.0');
  });

  it('refuses a missing, empty or oversized asset list', () => {
    expectInvalid(manifest({ assets: undefined }), /no assets/);
    expectInvalid(manifest({ assets: [] }), /no assets/);
    expectInvalid(manifest({ assets: {} }), /unexpected number/);
    const many = Object.fromEntries(Array.from({ length: 17 }, (_, index) => [
      `win32-x${index}`, { name: 'a.exe', size: MIN_ASSET_BYTES, sha256: SHA },
    ]));
    expectInvalid(manifest({ assets: many }), /unexpected number/);
  });

  it('refuses an asset key that is not a platform-architecture pair', () => {
    for (const key of ['win32', 'win32_x64', 'WIN32-X64', 'win32-x64-extra', '../win32-x64', '']) {
      expectInvalid(manifest({ assets: { [key]: { name: 'a.exe', size: MIN_ASSET_BYTES, sha256: SHA } } }), /platform-architecture/);
    }
  });

  it.each([
    ['a path separator', 'dir/Setup.exe'],
    ['a Windows separator', 'dir\\Setup.exe'],
    ['a parent directory', '..Setup.exe'],
    ['a leading dot', '.hidden.exe'],
    ['a space', 'Own the Block.dmg'],
    ['a query string', 'Setup.exe?x=1'],
    ['an empty name', ''],
    ['a long name', `${'a'.repeat(129)}.exe`],
  ])('refuses an asset name with %s, because it becomes a URL path and a file name', (_label, name) => {
    expectInvalid(manifest({ assets: { 'win32-x64': { name, size: MIN_ASSET_BYTES, sha256: SHA } } }), /unsafe file name/);
  });

  it('refuses a size outside what an installer can be', () => {
    for (const size of [0, MIN_ASSET_BYTES - 1, MAX_ASSET_BYTES + 1, -5, 1.5, '100', null, Number.NaN]) {
      expectInvalid(manifest({ assets: { 'win32-x64': { name: 'a.exe', size, sha256: SHA } } }), /implausible size/);
    }
    expect(parseUpdateManifest(manifest({ assets: { 'win32-x64': { name: 'a.exe', size: MAX_ASSET_BYTES, sha256: SHA } } })).assets['win32-x64'].size)
      .toBe(MAX_ASSET_BYTES);
  });

  it('requires a lowercase 64-digit SHA-256', () => {
    for (const sha256 of ['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), undefined, 12]) {
      expectInvalid(manifest({ assets: { 'win32-x64': { name: 'a.exe', size: MIN_ASSET_BYTES, sha256 } } }), /SHA-256/);
    }
  });

  it('selects the asset of one platform and architecture, and nothing for another', () => {
    const parsed = parseUpdateManifest(manifest());
    expect(assetKey('darwin', 'arm64')).toBe('darwin-arm64');
    expect(selectAsset(parsed, 'win32', 'x64')?.name).toBe('OwnTheBlock-1.2.0-win32-x64-Setup.exe');
    expect(selectAsset(parsed, 'darwin', 'arm64')?.name).toBe('OwnTheBlock-1.2.0-macos-arm64.dmg');
    expect(selectAsset(parsed, 'darwin', 'x64')).toBeUndefined();
    expect(selectAsset(parsed, 'linux', 'x64')).toBeUndefined();
    // Not an inherited property of the object.
    expect(selectAsset(parsed, 'constructor', '')).toBeUndefined();
  });

  it('makes an update mandatory only when the running version is below the minimum supported version', () => {
    const parsed = parseUpdateManifest(manifest({ version: '1.3.0', minimumSupportedVersion: '1.2.0' }));
    expect(isMandatoryUpdate('1.1.1', parsed)).toBe(true);
    expect(isMandatoryUpdate('1.2.0-rc.1', parsed)).toBe(true);
    expect(isMandatoryUpdate('1.2.0', parsed)).toBe(false);
    expect(isMandatoryUpdate('1.2.5', parsed)).toBe(false);
    expect(isMandatoryUpdate('1.3.0', parsed)).toBe(false);
  });
});

describe('Squirrel payload of a Windows asset', () => {
  const SETUP = { name: 'OwnTheBlock-1.2.0-win32-x64-Setup.exe', size: 168_398_848, sha256: SHA };
  const RELEASES = { name: 'RELEASES', size: 96, sha256: 'c'.repeat(64) };
  const PACKAGE = { name: 'own_the_block-1.2.0-full.nupkg', size: 168_250_791, sha256: 'd'.repeat(64) };
  const withSquirrel = (squirrel: unknown) => manifest({ assets: { 'win32-x64': { ...SETUP, squirrel } } });
  const asset = () => selectAsset(parseUpdateManifest(withSquirrel({ releases: RELEASES, package: PACKAGE })), 'win32', 'x64')!;

  it('reads the RELEASES file and the full package next to the installer', () => {
    const parsed = parseUpdateManifest(withSquirrel({ releases: RELEASES, package: PACKAGE, deltas: 'ignored' }));

    expect(parsed.assets['win32-x64']).toEqual({ ...SETUP, squirrel: { releases: RELEASES, package: PACKAGE } });
  });

  it('keeps an asset without the payload as a plain installer (macOS, or a release that predates it)', () => {
    expect(parseUpdateManifest(manifest()).assets['win32-x64']).not.toHaveProperty('squirrel');
  });

  it.each([
    ['that is not an object', 'RELEASES', /malformed Squirrel payload/],
    ['that is an array', [], /malformed Squirrel payload/],
    ['without a RELEASES file', { package: PACKAGE }, /RELEASES file must be an object/],
    ['without a package', { releases: RELEASES }, /Squirrel package must be an object/],
  ])('refuses a payload %s', (_label, squirrel, pattern) => {
    expectInvalid(withSquirrel(squirrel), pattern);
  });

  it.each([
    ['a RELEASES file under another name', { ...RELEASES, name: 'RELEASES.txt' }, /RELEASES file has an unsafe file name/],
    ['a RELEASES file with a path', { ...RELEASES, name: '../RELEASES' }, /RELEASES file has an unsafe file name/],
    ['an empty RELEASES file', { ...RELEASES, size: 0 }, /RELEASES file has an implausible size/],
    ['a RELEASES file that is too large to be a list of packages', { ...RELEASES, size: MAX_RELEASES_BYTES + 1 }, /RELEASES file has an implausible size/],
    ['a RELEASES file without a checksum', { ...RELEASES, sha256: 'C'.repeat(64) }, /RELEASES file has no valid SHA-256/],
  ])('refuses %s', (_label, releases, pattern) => {
    expectInvalid(withSquirrel({ releases, package: PACKAGE }), pattern);
  });

  it.each([
    ['a package that is not a .nupkg', { ...PACKAGE, name: 'package.zip' }, /Squirrel package has an unsafe file name/],
    ['a package with a path', { ...PACKAGE, name: 'a/b.nupkg' }, /Squirrel package has an unsafe file name/],
    ['a package with a space', { ...PACKAGE, name: 'own the block.nupkg' }, /Squirrel package has an unsafe file name/],
    ['a package too small to be an application', { ...PACKAGE, size: MIN_ASSET_BYTES - 1 }, /Squirrel package has an implausible size/],
    ['a package of an implausible size', { ...PACKAGE, size: MAX_ASSET_BYTES + 1 }, /Squirrel package has an implausible size/],
    ['a package without a checksum', { ...PACKAGE, sha256: 'nope' }, /Squirrel package has no valid SHA-256/],
  ])('refuses %s', (_label, pkg, pattern) => {
    expectInvalid(withSquirrel({ releases: RELEASES, package: pkg }), pattern);
  });

  describe('which files an installation downloads', () => {
    it('is the installer itself when the installer is what gets opened', () => {
      const payload = selectPayload(asset(), 'installer')!;

      expect(payload).toEqual({ kind: 'installer', files: [asset()], main: asset(), totalBytes: SETUP.size });
    });

    it('is the RELEASES file and then the package when Squirrel applies the update, never the Setup.exe', () => {
      const payload = selectPayload(asset(), 'squirrel')!;

      expect(payload.kind).toBe('squirrel');
      expect(payload.files.map(file => file.name)).toEqual(['RELEASES', 'own_the_block-1.2.0-full.nupkg']);
      expect(payload.main.name).toBe('own_the_block-1.2.0-full.nupkg');
      expect(payload.totalBytes).toBe(RELEASES.size + PACKAGE.size);
    });

    it('is nothing when the release has no Squirrel files for an installation that needs them', () => {
      const plain = selectAsset(parseUpdateManifest(manifest()), 'win32', 'x64')!;

      expect(selectPayload(plain, 'squirrel')).toBeUndefined();
      expect(selectPayload(plain, 'installer')?.main.name).toBe(SETUP.name);
    });
  });
});
