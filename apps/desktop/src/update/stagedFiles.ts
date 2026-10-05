import { mkdir, readdir, rm, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import { hashFile } from './downloader';
import type { UpdateFile, UpdatePayloadKind } from './manifest';
import { isValidVersion } from './version';

/**
 * A downloaded update waits in `<updates>/<version>/<payload kind>/<file names>` until the player applies it, also across
 * restarts ("Để sau"): the next check finds the verified files and goes straight to "ready" instead of downloading them
 * again. The folder is named after the release version, so cleaning up is a question of which versions are still wanted;
 * the payload kind is a folder of its own because Squirrel applies a whole folder (RELEASES plus the package) and must find
 * nothing else in it.
 */
export function stagedDirectory(updatesDirectory: string, version: string, kind: UpdatePayloadKind): string {
  return path.join(updatesDirectory, version, kind);
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

/** The files of `files` that are not staged in `directory` exactly as recorded (a retry downloads only these). */
export async function unverifiedFiles(directory: string, files: readonly UpdateFile[]): Promise<UpdateFile[]> {
  const missing: UpdateFile[] = [];
  for (const file of files) {
    if (!(await verifyStagedFile(path.join(directory, file.name), file))) missing.push(file);
  }
  return missing;
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
