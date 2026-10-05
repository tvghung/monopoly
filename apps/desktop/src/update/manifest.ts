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
 *     "win32-x64": {
 *       "name": "OwnTheBlock-1.2.0-win32-x64-Setup.exe", "size": 168398848, "sha256": "...",
 *       "squirrel": {
 *         "releases": { "name": "RELEASES", "size": 96, "sha256": "..." },
 *         "package": { "name": "own_the_block-1.2.0-full.nupkg", "size": 168250791, "sha256": "..." }
 *       }
 *     },
 *     "darwin-arm64": { "name": "OwnTheBlock-1.2.0-macos-arm64.dmg", "size": 181756558, "sha256": "..." }
 *   }
 * }
 * ```
 *
 * An asset is the installer of one target (the file a player would run or open by hand). On Windows it also carries the
 * Squirrel payload: the RELEASES file and the full .nupkg, which Squirrel's `Update.exe --update` applies next to the
 * running version. (Running the Setup.exe itself over a running install is not an update: Squirrel deletes the whole install
 * folder first, including the version that is running; measured on a real install.)
 *
 * The manifest never names a URL: see `updateConfig.ts`. Unknown extra fields are ignored so a later release can add
 * information without breaking this reader; a changed `schemaVersion` is the one deliberate break.
 */
export const UPDATE_MANIFEST_SCHEMA_VERSION = 1;
export const UPDATE_MANIFEST_APP = 'own-the-block';
export const MAX_MANIFEST_BYTES = 64 * 1024;
/** Nothing smaller than this is an installer or a Squirrel package. */
export const MIN_ASSET_BYTES = 1024 * 1024;
export const MAX_ASSET_BYTES = 1024 * 1024 * 1024;
/** The Squirrel RELEASES file is a line of text per package. */
export const MAX_RELEASES_BYTES = 64 * 1024;
export const SQUIRREL_RELEASES_NAME = 'RELEASES';

const MAX_ASSETS = 16;
const ASSET_KEY_PATTERN = /^[a-z0-9]+-[a-z0-9]+$/u;
// The name becomes part of a URL path and of a file name on disk: letters, digits, dot, underscore and hyphen only.
const ASSET_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const NUPKG_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.nupkg$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export interface UpdateFile {
  name: string;
  size: number;
  sha256: string;
}

export interface SquirrelPayload {
  releases: UpdateFile;
  package: UpdateFile;
}

export interface UpdateAsset extends UpdateFile {
  /** Windows only: what Squirrel applies in place. Absent for a target that has no such payload. */
  squirrel?: SquirrelPayload;
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

interface FileRules {
  label: string;
  minBytes: number;
  maxBytes: number;
  namePattern: RegExp;
  /** A fixed name, for the files the platform insists on. */
  exactName?: string;
}

function parseFile(value: unknown, rules: FileRules): UpdateFile {
  if (!isRecord(value)) throw invalid(`${rules.label} must be an object.`);
  const { name, size, sha256 } = value;
  if (typeof name !== 'string' || !rules.namePattern.test(name) || name.includes('..')
    || (rules.exactName !== undefined && name !== rules.exactName)) {
    throw invalid(`${rules.label} has an unsafe file name.`);
  }
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < rules.minBytes || size > rules.maxBytes) {
    throw invalid(`${rules.label} has an implausible size.`);
  }
  if (typeof sha256 !== 'string' || !SHA256_PATTERN.test(sha256)) {
    throw invalid(`${rules.label} has no valid SHA-256.`);
  }
  return { name, size, sha256 };
}

function parseAsset(key: string, value: unknown): UpdateAsset {
  const file = parseFile(value, {
    label: `Asset ${key}`, minBytes: MIN_ASSET_BYTES, maxBytes: MAX_ASSET_BYTES, namePattern: ASSET_NAME_PATTERN,
  });
  const squirrel = (value as Record<string, unknown>).squirrel;
  if (squirrel === undefined) return file;
  if (!isRecord(squirrel)) throw invalid(`Asset ${key} has a malformed Squirrel payload.`);
  return {
    ...file,
    squirrel: {
      releases: parseFile(squirrel.releases, {
        label: `Asset ${key} RELEASES file`,
        minBytes: 1,
        maxBytes: MAX_RELEASES_BYTES,
        namePattern: ASSET_NAME_PATTERN,
        exactName: SQUIRREL_RELEASES_NAME,
      }),
      package: parseFile(squirrel.package, {
        label: `Asset ${key} Squirrel package`,
        minBytes: MIN_ASSET_BYTES,
        maxBytes: MAX_ASSET_BYTES,
        namePattern: NUPKG_NAME_PATTERN,
      }),
    },
  };
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

/**
 * Which files of an asset the app downloads: the installer itself ("installer": opened for the player to finish), or the
 * Squirrel feed ("squirrel": the RELEASES file and the full package, applied in place by Update.exe).
 */
export type UpdatePayloadKind = 'installer' | 'squirrel';

export interface UpdatePayload {
  kind: UpdatePayloadKind;
  /** Download order. */
  files: readonly UpdateFile[];
  /** The file the installer works on (the installer, or the package). */
  main: UpdateFile;
  totalBytes: number;
}

export function selectPayload(asset: UpdateAsset, kind: UpdatePayloadKind): UpdatePayload | undefined {
  if (kind === 'installer') return { kind, files: [asset], main: asset, totalBytes: asset.size };
  if (!asset.squirrel) return undefined;
  const { releases, package: nupkg } = asset.squirrel;
  return { kind, files: [releases, nupkg], main: nupkg, totalBytes: releases.size + nupkg.size };
}
