import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KEPT_ELECTRON_LOCALES, pruneElectronLocales } from '../scripts/pruneElectronLocales.mjs';

let buildPath: string;

beforeEach(async () => {
  buildPath = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-locales-'));
});

afterEach(async () => {
  await rm(buildPath, { recursive: true, force: true });
});

async function writeLocales(names: string[]): Promise<void> {
  await mkdir(path.join(buildPath, 'locales'), { recursive: true });
  for (const name of names) await writeFile(path.join(buildPath, 'locales', name), 'pak');
}

describe('Electron locale pruning', () => {
  it('keeps Vietnamese and the en-US fallback', () => {
    expect(KEPT_ELECTRON_LOCALES).toEqual(['en-US', 'vi']);
  });

  it('removes every other locale pack on Windows', async () => {
    await writeLocales(['af.pak', 'de.pak', 'en-GB.pak', 'en-US.pak', 'vi.pak', 'zh-TW.pak']);
    const result = await pruneElectronLocales(buildPath, 'win32');
    expect(result.kept).toEqual(['en-US.pak', 'vi.pak']);
    expect(result.removed).toEqual(['af.pak', 'de.pak', 'en-GB.pak', 'zh-TW.pak']);
    expect((await readdir(path.join(buildPath, 'locales'))).sort()).toEqual(['en-US.pak', 'vi.pak']);
  });

  it('refuses to prune when a kept locale is missing', async () => {
    await writeLocales(['de.pak', 'en-US.pak']);
    await expect(pruneElectronLocales(buildPath, 'win32')).rejects.toThrow(/vi/u);
    expect((await readdir(path.join(buildPath, 'locales'))).sort()).toEqual(['de.pak', 'en-US.pak']);
  });

  it('only lists the macOS locale bundles', async () => {
    const resources = path.join(buildPath, 'Electron.app', 'Contents', 'Frameworks', 'Electron Framework.framework', 'Resources');
    await mkdir(path.join(resources, 'de.lproj'), { recursive: true });
    await mkdir(path.join(resources, 'vi.lproj'), { recursive: true });
    const result = await pruneElectronLocales(buildPath, 'darwin');
    expect(result.removed).toEqual([]);
    expect(result.listed).toHaveLength(2);
    expect((await readdir(resources)).sort()).toEqual(['de.lproj', 'vi.lproj']);
  });
});
