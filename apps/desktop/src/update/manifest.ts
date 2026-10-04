import { compareVersions, isValidVersion } from './version';

/**
 * `update-manifest.json`, written by `apps/desktop/scripts/updateManifest.mjs` when a release is staged and read here.
 * Both sides validate the same shape (`tests/updateManifestContract.test.ts` feeds the generator's output to this parser).
 *
 * ```json
 * {
 *   "schemaVersion": 1,
 *   "app": "own-the-block",
 *   "version": "1.2.0",
 *   "minimumSupportedVersion": "1.1.0",
 *   "assets": {
 *     "win32-x64": { "name": "OwnTheBlock-1.2.0-win32-x64-Setup.exe", "size": 168398848, "sha256": "..." }
 *   }
 * }
 * ```
 *
 * The manifest never names a URL: see `updateConfig.ts`. Unknown extra fields are ignored so a later release can add
 * information without breaking this reader; a changed `schemaVersion` is the one deliberate break.
 */
export const UPDATE_MANIFEST_SCHEMA_VERSION = 1;
export const UPDATE_MANIFEST_APP = 'own-the-block';
export const MAX_MANIFEST_BYTES = 64 * 1024;
/** Nothing smaller than this is an installer. */
export const MIN_ASSET_BYTES = 1024 * 1024;
export const MAX_ASSET_BYTES = 1024 * 1024 * 1024;

const MAX_ASSETS = 16;
const ASSET_KEY_PATTERN = /^[a-z0-9]+-[a-z0-9]+$/u;
// The name becomes part of a URL path and of a file name on disk: letters, digits, dot, underscore and hyphen only.
const ASSET_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export interface UpdateAsset {
  name: string;
  size: number;
  sha256: string;
}

export interface UpdateManifest {
  version: string;
  /** Versions below this must update before they play multiplayer. */
  minimumSupportedVersion: string;
  assets: Readonly<Record<string, UpdateAsset>>;
}

export type UpdateManifestErrorCode = 'MANIFEST_INVALID' | 'MANIFEST_UNSUPPORTED';

export class UpdateManifestError extends Error {
  public constructor(public readonly code: UpdateManifestErrorCode, message: string) {
    super(message);
    this.name = 'UpdateManifestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): UpdateManifestError {
  return new UpdateManifestError('MANIFEST_INVALID', message);
}

function parseAsset(key: string, value: unknown): UpdateAsset {
  if (!isRecord(value)) throw invalid(`Asset ${key} must be an object.`);
  const { name, size, sha256 } = value;
  if (typeof name !== 'string' || !ASSET_NAME_PATTERN.test(name) || name.includes('..')) {
    throw invalid(`Asset ${key} has an unsafe file name.`);
  }
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < MIN_ASSET_BYTES || size > MAX_ASSET_BYTES) {
    throw invalid(`Asset ${key} has an implausible size.`);
  }
  if (typeof sha256 !== 'string' || !SHA256_PATTERN.test(sha256)) {
    throw invalid(`Asset ${key} has no valid SHA-256.`);
  }
  return { name, size, sha256 };
}

export function parseUpdateManifest(raw: unknown): UpdateManifest {
  if (!isRecord(raw)) throw invalid('The update manifest must be a JSON object.');
  if (raw.app !== UPDATE_MANIFEST_APP) throw invalid('The update manifest is not for this application.');
  if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) {
    throw invalid('The update manifest has no schema version.');
  }
  if (raw.schemaVersion !== UPDATE_MANIFEST_SCHEMA_VERSION) {
    throw new UpdateManifestError('MANIFEST_UNSUPPORTED', `Unsupported manifest schema ${raw.schemaVersion}.`);
  }

  const { version, minimumSupportedVersion, assets } = raw;
  if (!isValidVersion(version)) throw invalid('The release version is not a semantic version.');
  if (!isValidVersion(minimumSupportedVersion)) throw invalid('The minimum supported version is not a semantic version.');
  if (compareVersions(minimumSupportedVersion, version) > 0) {
    throw invalid('The minimum supported version is newer than the release itself.');
  }
  if (!isRecord(assets)) throw invalid('The update manifest lists no assets.');
  const keys = Object.keys(assets);
  if (keys.length === 0 || keys.length > MAX_ASSETS) throw invalid('The update manifest lists an unexpected number of assets.');

  const parsed: Record<string, UpdateAsset> = {};
  for (const key of keys) {
    if (!ASSET_KEY_PATTERN.test(key)) throw invalid(`Asset key ${key} is not a platform-architecture pair.`);
    parsed[key] = parseAsset(key, assets[key]);
  }
  return { version, minimumSupportedVersion, assets: parsed };
}

export function assetKey(platform: string, architecture: string): string {
  return `${platform}-${architecture}`;
}

export function selectAsset(manifest: UpdateManifest, platform: string, architecture: string): UpdateAsset | undefined {
  const key = assetKey(platform, architecture);
  return Object.hasOwn(manifest.assets, key) ? manifest.assets[key] : undefined;
}

/** The running version is below the release's minimum supported version. */
export function isMandatoryUpdate(currentVersion: string, manifest: UpdateManifest): boolean {
  return compareVersions(currentVersion, manifest.minimumSupportedVersion) < 0;
}
