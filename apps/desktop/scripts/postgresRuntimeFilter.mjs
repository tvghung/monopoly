// Decides which files of the PostgreSQL binary archive ship in the packaged app. The archive is a full
// developer distribution; `runtimeExclude` in postgres-resources.json lists what the managed runtime never
// loads (link-time libraries, the StackBuilder GUI and DLLs outside the import closure of the binaries below).

/** The binaries `managedPostgres.ts` runs; they and everything they load must always ship. */
export const REQUIRED_POSTGRES_BINARIES = ['initdb', 'postgres', 'pg_ctl', 'pg_isready', 'createdb', 'psql'];

function escapeRegExp(text) {
  return text.replace(/[.+^${}()|[\]\\]/gu, '\\$&');
}

/**
 * A `runtimeExclude` pattern as a regular expression over a `/`-separated path relative to the archive root.
 * `**` matches any number of path segments, `*` matches within one segment, and a trailing `/**` also matches
 * the directory itself so that a recursive copy skips it whole. Matching ignores case (Windows file names).
 */
export function excludePatternToRegExp(pattern) {
  const normalized = pattern.replaceAll('\\', '/').replace(/^\/+/u, '');
  if (!normalized || normalized.split('/').includes('..')) throw new Error(`Invalid PostgreSQL runtime exclude pattern: ${pattern}`);
  let source = '';
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === '*' && normalized[index + 1] === '*') {
      if (normalized[index + 2] === '/') {
        source += '(?:.*/)?';
        index += 2;
      } else {
        source += '.*';
        index += 1;
      }
    } else if (character === '*') {
      source += '[^/]*';
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += escapeRegExp(character);
    }
  }
  if (normalized.endsWith('/**')) source = `${source.slice(0, -'/.*'.length)}(?:/.*)?`;
  return new RegExp(`^${source}$`, 'iu');
}

/** Whether `relativePath` (relative to the archive root, `/` or `\` separated) ships with the given excludes. */
export function shouldShipPostgresFile(relativePath, excludePatterns = []) {
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\.?\/+/u, '');
  if (!normalized) return true;
  return !excludePatterns.some(pattern => excludePatternToRegExp(pattern).test(normalized));
}

/** Throws when an exclude pattern would drop one of the required binaries for this platform. */
export function assertExcludesKeepRequiredBinaries(excludePatterns = [], extension = '') {
  for (const binary of REQUIRED_POSTGRES_BINARIES) {
    const file = `bin/${binary}${extension}`;
    if (!shouldShipPostgresFile(file, excludePatterns)) {
      throw new Error(`PostgreSQL runtime exclude patterns would drop the required ${file}`);
    }
  }
}
