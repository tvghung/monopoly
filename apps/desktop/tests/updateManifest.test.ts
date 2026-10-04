import { describe, expect, it } from 'vitest';
import {
  assetKey,
  isMandatoryUpdate,
  MAX_ASSET_BYTES,
  MIN_ASSET_BYTES,
  parseUpdateManifest,
  selectAsset,
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
