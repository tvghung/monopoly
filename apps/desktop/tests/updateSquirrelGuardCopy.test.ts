import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A file system without hard links (some network drives, FAT): the backup of the package is a copy instead.
vi.mock('node:fs/promises', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, link: vi.fn(() => Promise.reject(Object.assign(new Error('no hard links here'), { code: 'EPERM' }))) };
});

const { beginSquirrelGuard } = await import('../src/update/squirrelGuard');

const PACKAGE = 'own_the_block-1.0.0-full.nupkg';
let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-squirrel-copy-'));
  await mkdir(path.join(root, 'app-1.0.0'), { recursive: true });
  await mkdir(path.join(root, 'packages'), { recursive: true });
  await writeFile(path.join(root, 'packages', PACKAGE), 'package bytes');
  await writeFile(path.join(root, 'packages', 'RELEASES'), 'releases');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('guarding a Squirrel update without hard links', () => {
  it('backs the package up as a copy and restores it when Squirrel deleted it', async () => {
    const guard = await beginSquirrelGuard({ rootDirectory: root });
    expect((await stat(path.join(root, 'update-guard', PACKAGE))).nlink).toBe(1);
    await rm(path.join(root, 'packages', PACKAGE));
    await mkdir(path.join(root, 'app-1.1.0'));

    expect(await guard.rollback()).toBe(true);

    expect(await readFile(path.join(root, 'packages', PACKAGE), 'utf8')).toBe('package bytes');
  });
});
