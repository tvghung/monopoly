import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

// Electron ships Chromium UI strings for 55 locales (about 47 MiB on Windows). The game is Vietnamese-only, so
// the packaged app keeps Vietnamese plus en-US, Chromium's fallback locale. Forge calls this from the
// `packageAfterExtract` hook, before the app is copied in and before any signing.

export const KEPT_ELECTRON_LOCALES = ['en-US', 'vi'];

/**
 * Removes every `locales/*.pak` except the kept ones from an extracted Electron build (Windows and Linux layout).
 * macOS keeps its locales inside the framework bundle; they are only listed, not removed, until measured.
 */
export async function pruneElectronLocales(buildPath, platform, keep = KEPT_ELECTRON_LOCALES) {
  if (platform === 'darwin') {
    return { platform, removed: [], kept: [], listed: await listMacLocaleBundles(buildPath) };
  }

  const localesRoot = path.join(buildPath, 'locales');
  const packs = (await readdir(localesRoot)).filter(name => name.toLowerCase().endsWith('.pak'));
  const keptNames = new Set(keep.map(locale => `${locale}.pak`.toLowerCase()));
  const missing = keep.filter(locale => !packs.some(name => name.toLowerCase() === `${locale}.pak`.toLowerCase()));
  if (missing.length) {
    throw new Error(`Electron locales ${missing.join(', ')} are missing from ${localesRoot}; refusing to prune.`);
  }

  const removed = [];
  const kept = [];
  for (const name of packs.sort()) {
    if (keptNames.has(name.toLowerCase())) {
      kept.push(name);
    } else {
      await rm(path.join(localesRoot, name));
      removed.push(name);
    }
  }
  return { platform, removed, kept, listed: [] };
}

async function listMacLocaleBundles(buildPath) {
  const listed = [];
  async function walk(directory, depth) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.name.endsWith('.lproj')) listed.push(path.relative(buildPath, entryPath).replaceAll(path.sep, '/'));
      else if (depth < 8) await walk(entryPath, depth + 1);
    }
  }
  await walk(buildPath, 0);
  return listed.sort();
}
