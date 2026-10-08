import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkPackagedBudget,
  INSTALLER_BUDGETS,
  installerBudgetErrors,
  readAsarEntries,
} from '../scripts/checkPackagedBudget.mjs';

let root: string;
let packageRoot: string;
let resourcesRoot: string;

/** Writes an asar archive whose header lists `files` (path → size); file contents are not needed here. */
async function writeAsar(asarPath: string, files: Record<string, number>): Promise<void> {
  const header: { files: Record<string, unknown> } = { files: {} };
  let offset = 0;
  for (const [filePath, size] of Object.entries(files)) {
    let node = header;
    const parts = filePath.split('/');
    for (const part of parts.slice(0, -1)) {
      node.files[part] ??= { files: {} };
      node = node.files[part] as typeof header;
    }
    node.files[parts.at(-1) as string] = { size, offset: String(offset) };
    offset += size;
  }
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4);
  json.copy(padded);
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(8 + padded.length, 4);
  prefix.writeUInt32LE(4 + padded.length, 8);
  prefix.writeUInt32LE(json.length, 12);
  await writeFile(asarPath, Buffer.concat([prefix, padded, Buffer.alloc(offset)]));
}

async function writeFiles(base: string, files: string[]): Promise<void> {
  for (const file of files) {
    await mkdir(path.dirname(path.join(base, file)), { recursive: true });
    await writeFile(path.join(base, file), 'x');
  }
}

async function buildLeanPackage(): Promise<void> {
  await mkdir(resourcesRoot, { recursive: true });
  await writeAsar(path.join(resourcesRoot, 'app.asar'), { 'package.json': 10, 'dist/main.js': 100 });
  await writeFiles(resourcesRoot, [
    'cloudflared/win32-x64/cloudflared.exe',
    'dist/index.html', 'server-helper/server-helper.cjs',
  ]);
  await writeFile(path.join(resourcesRoot, 'cloudflared', 'win32-x64', 'cloudflared.sha256'),
    createHash('sha256').update('x').digest('hex'));
  await writeFile(path.join(resourcesRoot, 'cloudflared', 'LICENSE.cloudflared'), 'Apache License');
  await writeFiles(packageRoot, ['locales/en-US.pak', 'locales/vi.pak', 'OwnTheBlock.exe']);
}

function check() {
  return checkPackagedBudget({
    packageRoot,
    resourcesRoot,
    outRoot: path.join(root, 'out'),
    platform: 'win32',
    architecture: 'x64',
  });
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-budget-'));
  packageRoot = path.join(root, 'out', 'Own the Block-win32-x64');
  resourcesRoot = path.join(packageRoot, 'resources');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('installer size budget', () => {
  const MIB = 1048576;

  it('accepts the measured installers and flags ones over budget', () => {
    expect(installerBudgetErrors([
      { path: 'squirrel.windows/x64/OwnTheBlock-1.1.1-win32-x64-Setup.exe', size: 161 * MIB },
      { path: 'make/Own the Block-1.1.1-arm64.dmg', size: 173 * MIB },
    ])).toEqual([]);

    const errors = installerBudgetErrors([
      { path: 'squirrel.windows/x64/OwnTheBlock-1.1.1-win32-x64-Setup.exe', size: 250 * MIB },
      { path: 'make/Own the Block-1.1.1-arm64.dmg', size: 236 * MIB },
      { path: 'squirrel.windows/x64/own_the_block-1.1.1-full.nupkg', size: 900 * MIB },
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/Setup\.exe is 250\.0 MiB.*175\.0 MiB Windows Setup\.exe budget/u);
    expect(errors[1]).toMatch(/Own the Block-1\.1\.1-arm64\.dmg is 236\.0 MiB.*195\.0 MiB macOS DMG budget/u);
  });

  it('keeps every budget below the sizes the build had before the slimming work', () => {
    const [windows, mac] = INSTALLER_BUDGETS;
    expect(windows?.maxBytes).toBeLessThan(181.9 * MIB);
    expect(mac?.maxBytes).toBeLessThan(236.2 * MIB);
  });
});

describe('packaged size budget', () => {
  it('reads the file list from an asar header', async () => {
    await mkdir(root, { recursive: true });
    const asarPath = path.join(root, 'app.asar');
    await writeAsar(asarPath, { 'package.json': 10, 'dist/main.js': 100, 'dist/ipc/channels.js': 5 });
    expect(await readAsarEntries(asarPath)).toEqual([
      { path: 'package.json', size: 10 },
      { path: 'dist/main.js', size: 100 },
      { path: 'dist/ipc/channels.js', size: 5 },
    ]);
  });

  it('passes a lean package and reports its sizes', async () => {
    await buildLeanPackage();
    const { rows, errors } = await check();
    expect(errors).toEqual([]);
    expect(rows.map(([label]) => label)).toContain('resources/app.asar');
  });

  it('fails when app.asar packs generated resources again', async () => {
    await buildLeanPackage();
    await writeAsar(path.join(resourcesRoot, 'app.asar'), {
      'package.json': 10,
      'generated/cloudflared/win32-x64/cloudflared.exe': 10,
      'src/main.ts': 10,
    });
    const { errors } = await check();
    expect(errors.join('\n')).toMatch(/generated\//u);
    expect(errors.join('\n')).toMatch(/src\//u);
  });

  it('fails when obsolete PostgreSQL resources or an extra locale ship, or the tunnel is missing', async () => {
    await buildLeanPackage();
    await writeFiles(path.join(resourcesRoot, 'postgres'), ['postgres.exe']);
    await writeFiles(packageRoot, ['locales/de.pak']);
    await rm(path.join(resourcesRoot, 'cloudflared', 'win32-x64', 'cloudflared.exe'));
    const message = (await check()).errors.join('\n');
    expect(message).toMatch(/Obsolete PostgreSQL/u);
    expect(message).toMatch(/de\.pak/u);
    expect(message).toMatch(/cloudflared/u);
  });

  it('rejects a bundled tunnel whose verification digest no longer matches', async () => {
    await buildLeanPackage();
    await writeFile(path.join(resourcesRoot, 'cloudflared', 'win32-x64', 'cloudflared.exe'), 'modified');
    expect((await check()).errors.join('\n')).toMatch(/verification digest failed/u);
  });
});
