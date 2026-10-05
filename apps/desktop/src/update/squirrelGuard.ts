import { link, copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Makes one `Update.exe --update` all-or-nothing.
 *
 * Squirrel's update is not transactional. Measured on a real install (see the design record, section 4), a failed update
 * leaves its debris where the next launch looks:
 *
 * - `app-<new version>` stays behind, empty or partial. The stub that every shortcut starts picks the highest version
 *   folder, finds no executable in it and starts nothing, so after one failure the game cannot be opened any more (a retry of
 *   the same update repairs it, but a player who closes the game instead has nothing left to click).
 * - `packages\<new version>.nupkg` stays behind, and in the worst case (the "fall back to full updates" path) `RELEASES` is
 *   rewritten to the version that never installed and the package of the running version is deleted, so that every later
 *   update believes the failed version is the installed one.
 *
 * The guard records what the install folder looked like just before the update and puts exactly that back when the update
 * fails: version folders that did not exist before are removed, `RELEASES` gets its old bytes back, packages that Squirrel
 * deleted come back (they are kept as hard links, so no 160 MiB copy where the file system allows it), and packages that
 * Squirrel added are removed. It only ever undoes what the failed attempt did. A kill in the middle of the update (power
 * loss, ending the process tree) is beyond it; the next successful update repairs that state, because Squirrel removes a
 * partially applied folder of the version it installs.
 */
export interface SquirrelGuard {
  /** Puts the install folder back as it was before the update. Never throws; returns false when something could not be undone. */
  rollback(): Promise<boolean>;
  /** The update worked: drops the backups. Never throws. */
  commit(): Promise<void>;
}

export interface SquirrelGuardOptions {
  /** The Squirrel install root, the folder that holds `Update.exe`, `packages` and the `app-<version>` folders. */
  rootDirectory: string;
  log?: (message: string, error?: unknown) => void;
}

const GUARD_DIRECTORY_NAME = 'update-guard';
const VERSION_FOLDER = /^app-/iu;
const PACKAGE_FILE = /\.nupkg$/iu;
const RELEASES_FILE = 'RELEASES';

async function listNames(directory: string, kind: 'directories' | 'files'): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter(entry => (kind === 'directories' ? entry.isDirectory() : entry.isFile())).map(entry => entry.name);
  } catch {
    return [];
  }
}

/** A hard link when the file system has them (no extra space, and it survives Squirrel deleting the original name), a copy otherwise. */
async function keep(from: string, to: string): Promise<void> {
  try {
    await link(from, to);
  } catch {
    await copyFile(from, to);
  }
}

/**
 * Takes the snapshot. Throws when the install folder cannot be read or the backups cannot be made: an update that cannot be
 * undone is not started.
 */
export async function beginSquirrelGuard(options: SquirrelGuardOptions): Promise<SquirrelGuard> {
  const { rootDirectory } = options;
  const log = options.log ?? (() => undefined);
  const packagesDirectory = path.join(rootDirectory, 'packages');
  const guardDirectory = path.join(rootDirectory, GUARD_DIRECTORY_NAME);

  const versionFolders = new Set((await listNames(rootDirectory, 'directories')).filter(name => VERSION_FOLDER.test(name)));
  if (versionFolders.size === 0) throw new Error('The install folder has no version folder.');
  const packageNames = await listNames(packagesDirectory, 'files');
  const releasesBefore = packageNames.includes(RELEASES_FILE)
    ? await readFile(path.join(packagesDirectory, RELEASES_FILE))
    : undefined;

  // A guard folder left by an update that was killed holds backups of an older state: never reuse them.
  await rm(guardDirectory, { recursive: true, force: true });
  await mkdir(guardDirectory, { recursive: true });
  const backedUp: string[] = [];
  for (const name of packageNames.filter(item => PACKAGE_FILE.test(item))) {
    await keep(path.join(packagesDirectory, name), path.join(guardDirectory, name));
    backedUp.push(name);
  }

  const dropBackups = (): Promise<void> => rm(guardDirectory, { recursive: true, force: true }).catch(() => undefined);

  return {
    async rollback() {
      let clean = true;
      const attempt = async (what: string, action: () => Promise<void>): Promise<void> => {
        try {
          await action();
        } catch (error) {
          clean = false;
          log(`Rolling back the update: ${what} failed.`, error);
        }
      };

      // 1. Version folders the failed update created (or half-created).
      for (const name of await listNames(rootDirectory, 'directories')) {
        if (!VERSION_FOLDER.test(name) || versionFolders.has(name)) continue;
        await attempt(`removing ${name}`, () => rm(path.join(rootDirectory, name), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
      }

      // 2. Packages: what Squirrel deleted comes back, what it added goes away, RELEASES gets its old bytes.
      const present = new Set(await listNames(packagesDirectory, 'files'));
      for (const name of backedUp) {
        if (present.has(name)) continue;
        await attempt(`restoring ${name}`, () => keep(path.join(guardDirectory, name), path.join(packagesDirectory, name)));
      }
      for (const name of present) {
        if (!PACKAGE_FILE.test(name) || packageNames.includes(name)) continue;
        await attempt(`removing ${name}`, () => rm(path.join(packagesDirectory, name), { force: true }));
      }
      if (releasesBefore) {
        await attempt('restoring RELEASES', () => writeFile(path.join(packagesDirectory, RELEASES_FILE), releasesBefore));
      } else if (present.has(RELEASES_FILE)) {
        await attempt('removing RELEASES', () => rm(path.join(packagesDirectory, RELEASES_FILE), { force: true }));
      }

      await dropBackups();
      return clean;
    },
    commit: dropBackups,
  };
}
