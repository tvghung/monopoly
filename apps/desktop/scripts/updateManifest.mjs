import { readFileSync } from 'node:fs';
import path from 'node:path';

// The release side of the in-app update feed. `stageReleaseAssets.mjs` writes `update-manifest.json` next to the installers
// of a GitHub Release, and the app (`apps/desktop/src/update/manifest.ts`) reads the one of the latest release to learn
// whether a newer version exists, which installer is its own, and whether its running version must update first.
//
// The manifest names installers and checksums, never URLs: the app builds the download URL itself from the release
// version and the file name (`src/update/updateConfig.ts`). `tests/updateManifestContract.test.ts` feeds what this file
// generates to the app's parser, and keeps the constants and the version comparison below equal to the TypeScript ones.

export const UPDATE_MANIFEST_FILE_NAME = 'update-manifest.json';
export const UPDATE_MANIFEST_SCHEMA_VERSION = 1;
export const UPDATE_MANIFEST_APP = 'own-the-block';
export const UPDATE_REPOSITORY = 'tvghung/monopoly';
export const UPDATE_POLICY_RELATIVE_PATH = 'apps/desktop/update-policy.json';
/** Nothing smaller than this is an installer; the app refuses a manifest that claims one. */
export const MIN_ASSET_BYTES = 1024 * 1024;
export const MAX_ASSET_BYTES = 1024 * 1024 * 1024;

const ASSET_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const ASSET_KEY_PATTERN = /^[a-z0-9]+-[a-z0-9]+$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
// The regular expression published on semver.org.
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/u;

export function parseVersion(value) {
  if (typeof value !== 'string') return undefined;
  const match = VERSION_PATTERN.exec(value);
  if (!match) return undefined;
  const [, major, minor, patch, prerelease] = match;
  const numbers = [Number(major), Number(minor), Number(patch)];
  if (!numbers.every(Number.isSafeInteger)) return undefined;
  return {
    major: numbers[0],
    minor: numbers[1],
    patch: numbers[2],
    prerelease: prerelease === undefined ? [] : prerelease.split('.').map(part => (/^\d+$/u.test(part) ? Number(part) : part)),
  };
}

function comparePrerelease(left, right) {
  if (left.length === 0 || right.length === 0) return right.length - left.length;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === b) continue;
    if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : 1;
    if (typeof a === 'number') return -1;
    if (typeof b === 'number') return 1;
    return a < b ? -1 : 1;
  }
  return left.length - right.length;
}

/** Negative when `left` is older than `right`, positive when newer, 0 for the same precedence (semver.org §11). */
export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new RangeError(`Not a semantic version: ${a ? right : left}`);
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

export function assetKeyOf(platform, architecture) {
  return `${platform}-${architecture}`;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `apps/desktop/update-policy.json`: the one decision a release author makes about updates. Every version below
 * `minimumSupportedVersion` is told that an update is mandatory (it may not start or join multiplayer until it has updated).
 * Raise it only when an older version really cannot play with the new one, for example after a socket protocol change;
 * leave it where it is for a bug fix.
 */
export function validateUpdatePolicy(policy) {
  if (!isRecord(policy)) throw new Error(`${UPDATE_POLICY_RELATIVE_PATH} must be a JSON object.`);
  const { minimumSupportedVersion } = policy;
  if (parseVersion(minimumSupportedVersion) === undefined) {
    throw new Error(`${UPDATE_POLICY_RELATIVE_PATH}: minimumSupportedVersion must be a semantic version.`);
  }
  return { minimumSupportedVersion };
}

export function readUpdatePolicy(root) {
  let policy;
  try {
    policy = JSON.parse(readFileSync(path.join(root, UPDATE_POLICY_RELATIVE_PATH), 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${UPDATE_POLICY_RELATIVE_PATH}.`, { cause: error });
  }
  return validateUpdatePolicy(policy);
}

/**
 * The manifest of one release. `assets` maps `<platform>-<architecture>` to the installer of that target:
 * `{ name, size, sha256 }`, as staged (and already checked against its build job) by `stageReleaseAssets.mjs`.
 */
export function buildUpdateManifest({ version, policy, assets }) {
  if (parseVersion(version) === undefined) throw new Error(`The release version ${String(version)} is not a semantic version.`);
  const { minimumSupportedVersion } = validateUpdatePolicy(policy);
  if (compareVersions(minimumSupportedVersion, version) > 0) {
    throw new Error(
      `${UPDATE_POLICY_RELATIVE_PATH}: minimumSupportedVersion ${minimumSupportedVersion} is newer than the release ${version}.`,
    );
  }
  if (!isRecord(assets) || Object.keys(assets).length === 0) throw new Error('A release needs at least one installer.');

  const listed = {};
  for (const [key, asset] of Object.entries(assets)) {
    if (!ASSET_KEY_PATTERN.test(key)) throw new Error(`Installer key ${key} is not a platform-architecture pair.`);
    const { name, size, sha256 } = asset;
    if (typeof name !== 'string' || !ASSET_NAME_PATTERN.test(name) || name.includes('..')) {
      throw new Error(`Installer ${key} has an unsafe file name: ${String(name)}.`);
    }
    if (!Number.isSafeInteger(size) || size < MIN_ASSET_BYTES || size > MAX_ASSET_BYTES) {
      throw new Error(`Installer ${name} has an implausible size (${String(size)} bytes); the app would refuse the manifest.`);
    }
    if (typeof sha256 !== 'string' || !SHA256_PATTERN.test(sha256)) throw new Error(`Installer ${name} has no valid SHA-256.`);
    listed[key] = { name, size, sha256 };
  }
  return {
    schemaVersion: UPDATE_MANIFEST_SCHEMA_VERSION,
    app: UPDATE_MANIFEST_APP,
    version,
    minimumSupportedVersion,
    assets: listed,
  };
}
