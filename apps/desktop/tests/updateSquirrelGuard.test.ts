import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { beginSquirrelGuard } from '../src/update/squirrelGuard';

/**
 * A Squirrel install root as the real one looks (measured on a real install): Update.exe and the stub next to the
 * `app-<version>` folders and `packages` with the full package and a RELEASES file that has a byte order mark.
 */
const BOM = String.fromCharCode(0xfeff);
const OLD_PACKAGE = 'own_the_block-1.0.0-full.nupkg';
const NEW_PACKAGE = 'own_the_block-1.1.0-full.nupkg';
const OLD_RELEASES = `${BOM}3A11095A46849F70802488916BF1D72EEB69B45E ${OLD_PACKAGE} 12`;
const NEW_RELEASES = `${BOM}7017096D90E4E4E5A80B3D0D23B2ECC23D41E1CE ${NEW_PACKAGE} 13`;

let root: string;
const packages = () => path.join(root, 'packages');

async function names(directory: string): Promise<string[]> {
  return (await readdir(directory)).sort();
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-squirrel-'));
  await writeFile(path.join(root, 'Update.exe'), 'updater');
  await writeFile(path.join(root, 'OwnTheBlock.exe'), 'stub');
  await mkdir(path.join(root, 'app-1.0.0', 'resources'), { recursive: true });
  await writeFile(path.join(root, 'app-1.0.0', 'OwnTheBlock.exe'), 'the running app');
  await writeFile(path.join(root, 'app-1.0.0', 'resources', 'app.asar'), 'asar');
  await mkdir(path.join(packages(), 'SquirrelTemp'), { recursive: true });
  await writeFile(path.join(packages(), OLD_PACKAGE), 'old package bytes');
  await writeFile(path.join(packages(), 'RELEASES'), OLD_RELEASES, 'utf8');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** What a failed `Update.exe --update` was seen to leave behind. */
async function leaveEarlyFailureDebris(): Promise<void> {
  await mkdir(path.join(root, 'app-1.1.0'), { recursive: true });
  await writeFile(path.join(packages(), NEW_PACKAGE), 'new package bytes');
  await writeFile(path.join(packages(), '.betaId'), 'id');
}

/** The "fall back to full updates" failure: RELEASES rewritten to the version that never installed, the old package deleted. */
async function leavePoison(): Promise<void> {
  await mkdir(path.join(root, 'app-1.1.0'), { recursive: true });
  await rm(path.join(packages(), OLD_PACKAGE));
  await writeFile(path.join(packages(), NEW_PACKAGE), 'new package bytes');
  await writeFile(path.join(packages(), 'RELEASES'), NEW_RELEASES, 'utf8');
}

describe('guarding a Squirrel update', () => {
  it('removes the empty version folder and the package a failed update left, so the next launch starts the old version', async () => {
    const guard = await beginSquirrelGuard({ rootDirectory: root });
    await leaveEarlyFailureDebris();

    expect(await guard.rollback()).toBe(true);

    expect(await names(root)).toEqual(['OwnTheBlock.exe', 'Update.exe', 'app-1.0.0', 'packages']);
    expect(await names(packages())).toEqual(['.betaId', 'RELEASES', 'SquirrelTemp', OLD_PACKAGE].sort());
    expect(await readFile(path.join(packages(), OLD_PACKAGE), 'utf8')).toBe('old package bytes');
    expect(await readFile(path.join(packages(), 'RELEASES'), 'utf8')).toBe(OLD_RELEASES);
  });

  it('undoes the worst case: RELEASES rewritten to the failed version and the running version package deleted', async () => {
    const guard = await beginSquirrelGuard({ rootDirectory: root });
    await leavePoison();

    expect(await guard.rollback()).toBe(true);

    expect(await names(root)).toEqual(['OwnTheBlock.exe', 'Update.exe', 'app-1.0.0', 'packages']);
    expect(await readFile(path.join(packages(), OLD_PACKAGE), 'utf8')).toBe('old package bytes');
    expect((await names(packages())).filter(name => name.endsWith('.nupkg'))).toEqual([OLD_PACKAGE]);
    // Byte for byte, the byte order mark included: Squirrel reads this file to learn which version is installed.
    expect((await readFile(path.join(packages(), 'RELEASES'))).equals(Buffer.from(OLD_RELEASES, 'utf8'))).toBe(true);
  });

  it('never touches the running version, the stub or Update.exe', async () => {
    const guard = await beginSquirrelGuard({ rootDirectory: root });
    await leavePoison();
    await guard.rollback();

    expect(await readFile(path.join(root, 'app-1.0.0', 'OwnTheBlock.exe'), 'utf8')).toBe('the running app');
    expect(await readFile(path.join(root, 'app-1.0.0', 'resources', 'app.asar'), 'utf8')).toBe('asar');
    expect(await readFile(path.join(root, 'Update.exe'), 'utf8')).toBe('updater');
    expect(await readFile(path.join(root, 'OwnTheBlock.exe'), 'utf8')).toBe('stub');
  });

  it('removes only the version folders that did not exist before, and keeps older ones', async () => {
    await mkdir(path.join(root, 'app-0.9.0'), { recursive: true });
    const guard = await beginSquirrelGuard({ rootDirectory: root });
    await leaveEarlyFailureDebris();

    await guard.rollback();

    expect((await names(root)).filter(name => name.startsWith('app-'))).toEqual(['app-0.9.0', 'app-1.0.0']);
  });

  it('is harmless when the update changed nothing', async () => {
    const guard = await beginSquirrelGuard({ rootDirectory: root });

    expect(await guard.rollback()).toBe(true);

    expect(await names(root)).toEqual(['OwnTheBlock.exe', 'Update.exe', 'app-1.0.0', 'packages']);
    expect(await readFile(path.join(packages(), 'RELEASES'), 'utf8')).toBe(OLD_RELEASES);
    expect(await names(packages())).toEqual(['RELEASES', 'SquirrelTemp', OLD_PACKAGE].sort());
  });

  it('keeps the backup of the package as a hard link, not a copy of 160 MiB', async () => {
    await beginSquirrelGuard({ rootDirectory: root });

    const [original, backup] = await Promise.all([
      stat(path.join(packages(), OLD_PACKAGE)),
      stat(path.join(root, 'update-guard', OLD_PACKAGE)),
    ]);
    expect(original.ino).toBe(backup.ino);
    expect(original.nlink).toBe(2);
  });

  it('leaves the result of a successful update alone and drops its backups on commit', async () => {
    const guard = await beginSquirrelGuard({ rootDirectory: root });
    await mkdir(path.join(root, 'app-1.1.0'), { recursive: true });
    await writeFile(path.join(root, 'app-1.1.0', 'OwnTheBlock.exe'), 'the new app');
    await rm(path.join(packages(), OLD_PACKAGE));
    await writeFile(path.join(packages(), NEW_PACKAGE), 'new package bytes');
    await writeFile(path.join(packages(), 'RELEASES'), NEW_RELEASES, 'utf8');

    await guard.commit();

    expect(await names(root)).toEqual(['OwnTheBlock.exe', 'Update.exe', 'app-1.0.0', 'app-1.1.0', 'packages']);
    expect(await names(packages())).toEqual(['RELEASES', 'SquirrelTemp', NEW_PACKAGE].sort());
    expect(await readFile(path.join(packages(), 'RELEASES'), 'utf8')).toBe(NEW_RELEASES);
  });

  it('drops its backups after a rollback too', async () => {
    const guard = await beginSquirrelGuard({ rootDirectory: root });
    await leavePoison();

    await guard.rollback();

    expect(await names(root)).not.toContain('update-guard');
  });

  it('never reuses the backups of an update that was killed', async () => {
    await mkdir(path.join(root, 'update-guard'), { recursive: true });
    await writeFile(path.join(root, 'update-guard', 'own_the_block-0.5.0-full.nupkg'), 'from a killed update');

    const guard = await beginSquirrelGuard({ rootDirectory: root });
    await leavePoison();
    await guard.rollback();

    // A restored 0.5.0 package would make Squirrel believe an older version is the newest.
    expect((await names(packages())).filter(name => name.endsWith('.nupkg'))).toEqual([OLD_PACKAGE]);
  });

  it('puts back what it can and says so when one part cannot be undone', async () => {
    const messages: string[] = [];
    const guard = await beginSquirrelGuard({ rootDirectory: root, log: message => messages.push(message) });
    await leavePoison();
    await rm(path.join(root, 'update-guard', OLD_PACKAGE));

    expect(await guard.rollback()).toBe(false);

    expect(messages.some(message => message.includes(`restoring ${OLD_PACKAGE}`))).toBe(true);
    // The rest was still undone.
    expect(await names(root)).not.toContain('app-1.1.0');
    expect(await readFile(path.join(packages(), 'RELEASES'), 'utf8')).toBe(OLD_RELEASES);
  });

  it('works when the install has no RELEASES file yet, and does not invent one', async () => {
    await rm(path.join(packages(), 'RELEASES'));
    const guard = await beginSquirrelGuard({ rootDirectory: root });
    await writeFile(path.join(packages(), 'RELEASES'), NEW_RELEASES, 'utf8');

    expect(await guard.rollback()).toBe(true);

    expect(await names(packages())).not.toContain('RELEASES');
  });

  it('refuses to start when the folder is not an install (no version folder to protect)', async () => {
    await rm(path.join(root, 'app-1.0.0'), { recursive: true });

    await expect(beginSquirrelGuard({ rootDirectory: root })).rejects.toThrow(/no version folder/);
    await expect(beginSquirrelGuard({ rootDirectory: path.join(root, 'missing') })).rejects.toThrow();
  });
});
