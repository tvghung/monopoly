/**
 * Semantic version precedence (semver.org §11) for the update check: is the release in the feed newer than the running
 * app, and is the running app below the release's minimum supported version. Build metadata (`+...`) never counts, and a
 * pre-release (`1.2.0-rc.1`) is older than its release (`1.2.0`).
 *
 * `apps/desktop/scripts/updateManifest.mjs` carries a copy of this comparison for the release tooling (plain Node, no
 * TypeScript); `tests/updateManifestContract.test.ts` keeps the two equal.
 */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: readonly (number | string)[];
}

// The regular expression published on semver.org.
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/u;

export function parseVersion(value: string): ParsedVersion | undefined {
  const match = VERSION_PATTERN.exec(value);
  if (!match) return undefined;
  const [, major, minor, patch, prerelease] = match;
  const numbers = [Number(major), Number(minor), Number(patch)];
  if (!numbers.every(Number.isSafeInteger)) return undefined;
  return {
    major: numbers[0],
    minor: numbers[1],
    patch: numbers[2],
    prerelease: prerelease === undefined
      ? []
      : prerelease.split('.').map(part => (/^\d+$/u.test(part) ? Number(part) : part)),
  };
}

export function isValidVersion(value: unknown): value is string {
  return typeof value === 'string' && parseVersion(value) !== undefined;
}

function comparePrerelease(left: readonly (number | string)[], right: readonly (number | string)[]): number {
  // A version without a pre-release is newer than one with it.
  if (left.length === 0 || right.length === 0) return right.length - left.length;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === b) continue;
    // A numeric identifier is older than an alphanumeric one; two numbers compare as numbers, two words as text.
    if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : 1;
    if (typeof a === 'number') return -1;
    if (typeof b === 'number') return 1;
    return a < b ? -1 : 1;
  }
  return left.length - right.length;
}

/** Negative when `left` is older than `right`, positive when newer, 0 when they have the same precedence. */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new RangeError(`Not a semantic version: ${a ? right : left}`);
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}
