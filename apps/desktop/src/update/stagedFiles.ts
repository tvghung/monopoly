import { mkdir, readdir, rm, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import { hashFile } from './downloader';
import { isValidVersion } from './version';

/**
 * A downloaded installer waits in `<updates>/<version>/<file name>` until the player applies it, also across restarts
 * ("Để sau"): the next check finds the verified file and goes straight to "ready" instead of downloading it again. The
 * folder is named after the release version, so cleaning up is a question of which versions are still wanted.
 */
export function stagedFilePath(updatesDirectory: string, version: string, assetName: string): string {
  return path.join(updatesDirectory, version, assetName);
}

/** The file exists with exactly the recorded size and checksum. Anything else (missing, partial, altered) is "not staged". */
export async function verifyStagedFile(filePath: string, expected: { size: number; sha256: string }): Promise<boolean> {
  try {
    const metadata = await stat(filePath);
    if (!metadata.isFile() || metadata.size !== expected.size) return false;
    return (await hashFile(filePath)) === expected.sha256;
  } catch {
    return false;
  }
}

/**
 * Removes every staged release the caller no longer wants. Only a folder whose name is a release version is touched, so
 * a stray file or a folder somebody else put here is left alone.
 */
export async function pruneStagedUpdates(
  updatesDirectory: string,
  isWanted: (version: string) => boolean,
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(updatesDirectory, { withFileTypes: true });
  } catch {
    return [];
  }
  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isValidVersion(entry.name) || isWanted(entry.name)) continue;
    try {
      await rm(path.join(updatesDirectory, entry.name), { recursive: true, force: true });
      removed.push(entry.name);
    } catch {
      // A file that is still locked goes with the next clean-up.
    }
  }
  return removed;
}

/** Bytes a normal user can still write to the disk that holds `directory`; undefined when the system will not say. */
export async function freeDiskBytes(directory: string): Promise<number | undefined> {
  try {
    await mkdir(directory, { recursive: true });
    const info = await statfs(directory);
    const free = Number(info.bavail) * Number(info.bsize);
    return Number.isFinite(free) ? free : undefined;
  } catch {
    return undefined;
  }
}
