import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkPackagedBudget, readAsarEntries } from '../scripts/checkPackagedBudget.mjs';

const postgresResources = {
  targets: {
    'win32-x64': { runtimeExclude: ['lib/**/*.lib', 'bin/wx*.dll'] },
  },
};
const REQUIRED = ['initdb', 'postgres', 'pg_ctl', 'pg_isready', 'createdb', 'psql'];

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
  await writeFiles(path.join(resourcesRoot, 'postgres', 'win32-x64'), [
    ...REQUIRED.map(binary => `bin/${binary}.exe`),
    'bin/icuuc67.dll',
    'lib/plpgsql.dll',
  ]);
  await writeFiles(resourcesRoot, ['dist/index.html', 'server-helper/server-helper.cjs']);
  await writeFiles(packageRoot, ['locales/en-US.pak', 'locales/vi.pak', 'OwnTheBlock.exe']);
}

function check() {
  return checkPackagedBudget({
    packageRoot,
    resourcesRoot,
    outRoot: path.join(root, 'out'),
    platform: 'win32',
    architecture: 'x64',
    postgresResources,
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

  it('fails when app.asar packs the generated PostgreSQL copy again', async () => {
    await buildLeanPackage();
    await writeAsar(path.join(resourcesRoot, 'app.asar'), {
      'package.json': 10,
      'generated/postgres/win32-x64/bin/postgres.exe': 10,
      'src/main.ts': 10,
    });
    const { errors } = await check();
    expect(errors.join('\n')).toMatch(/generated\//u);
    expect(errors.join('\n')).toMatch(/src\//u);
  });

  it('fails when an excluded PostgreSQL file or an extra locale ships, or a binary is missing', async () => {
    await buildLeanPackage();
    await writeFiles(path.join(resourcesRoot, 'postgres', 'win32-x64'), ['bin/wxbase32u.dll', 'lib/libpq.lib']);
    await writeFiles(packageRoot, ['locales/de.pak']);
    await rm(path.join(resourcesRoot, 'postgres', 'win32-x64', 'bin', 'initdb.exe'));
    const message = (await check()).errors.join('\n');
    expect(message).toMatch(/excluded file/u);
    expect(message).toMatch(/de\.pak/u);
    expect(message).toMatch(/initdb\.exe/u);
  });
});
