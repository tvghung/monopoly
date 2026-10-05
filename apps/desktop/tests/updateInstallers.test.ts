import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { squirrelUpdateExePath } from '../src/squirrelEvents';
import {
  createOpenInstaller,
  createSquirrelUpdateInstaller,
  selectInstaller,
  type StagedUpdate,
} from '../src/update/installers';

type SpawnCall = { command: string; args: readonly string[]; options: Record<string, unknown> };
type Behaviour = 'exit0' | 'exit1' | 'error' | 'hang' | 'throw';

class FakeChild extends EventEmitter {
  public readonly unref = vi.fn();
}

/**
 * A spawn double. `script` decides, per call, what the child does: exit with a code, fail to start, or never end. `effect`
 * stands in for what the real process does to the disk before it ends (Squirrel unpacks a version folder, a failed one leaves
 * debris).
 */
function fakeSpawn(
  script: (call: SpawnCall, index: number) => Behaviour,
  effect: (call: SpawnCall, index: number) => Promise<void> = () => Promise.resolve(),
) {
  const calls: SpawnCall[] = [];
  const children: FakeChild[] = [];
  const effects: Promise<void>[] = [];
  const spawnProcess = ((command: string, args: readonly string[], options: Record<string, unknown>) => {
    const call = { command, args, options };
    const index = calls.length;
    calls.push(call);
    const behaviour = script(call, index);
    if (behaviour === 'throw') throw new Error('spawn failed synchronously');
    const child = new FakeChild();
    children.push(child);
    const done = effect(call, index);
    effects.push(done);
    void done.then(() => {
      if (behaviour === 'exit0') child.emit('exit', 0);
      else if (behaviour === 'exit1') child.emit('exit', 1);
      else if (behaviour === 'error') child.emit('error', new Error('spawn EPERM'));
    });
    return child;
  }) as never;
  return { spawnProcess, calls, children, effects };
}

const BOM = String.fromCharCode(0xfeff);
const OLD_RELEASES = `${BOM}3A11095A46849F70802488916BF1D72EEB69B45E own_the_block-1.0.0-full.nupkg 12`;

let installRoot: string;
let updateExe: string;
let staged: StagedUpdate;

beforeEach(async () => {
  // A Squirrel install as the real one looks, and a staged feed in a folder with spaces and an accent in its name: a
  // player's user name is not always plain ASCII.
  installRoot = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-installer-'));
  updateExe = path.join(installRoot, 'Update.exe');
  await writeFile(updateExe, 'updater');
  await mkdir(path.join(installRoot, 'app-1.0.0'), { recursive: true });
  await writeFile(path.join(installRoot, 'app-1.0.0', 'OwnTheBlock.exe'), 'running app');
  await mkdir(path.join(installRoot, 'packages'), { recursive: true });
  await writeFile(path.join(installRoot, 'packages', 'own_the_block-1.0.0-full.nupkg'), 'old package');
  await writeFile(path.join(installRoot, 'packages', 'RELEASES'), OLD_RELEASES, 'utf8');
  const feed = path.join(installRoot, 'Nguyễn Văn A', 'OwnTheBlock-updates', '1.2.0', 'squirrel');
  await mkdir(feed, { recursive: true });
  staged = { version: '1.2.0', directory: feed, mainFile: path.join(feed, 'own_the_block-1.2.0-full.nupkg') };
});

afterEach(async () => {
  await rm(installRoot, { recursive: true, force: true });
});

/** What a good `Update.exe --update` does to the install folder. */
async function unpackNewVersion(): Promise<void> {
  await mkdir(path.join(installRoot, 'app-1.2.0'), { recursive: true });
  await writeFile(path.join(installRoot, 'app-1.2.0', 'OwnTheBlock.exe'), 'new app');
  await rm(path.join(installRoot, 'packages', 'own_the_block-1.0.0-full.nupkg'));
  await writeFile(path.join(installRoot, 'packages', 'own_the_block-1.2.0-full.nupkg'), 'new package');
  await writeFile(path.join(installRoot, 'packages', 'RELEASES'), `${BOM}AAAA own_the_block-1.2.0-full.nupkg 11`, 'utf8');
}

/** What a failed one was seen to leave: an empty version folder, the package, a rewritten RELEASES and the old package gone. */
async function leaveDebris(): Promise<void> {
  await mkdir(path.join(installRoot, 'app-1.2.0'), { recursive: true });
  await rm(path.join(installRoot, 'packages', 'own_the_block-1.0.0-full.nupkg'));
  await writeFile(path.join(installRoot, 'packages', 'own_the_block-1.2.0-full.nupkg'), 'new package');
  await writeFile(path.join(installRoot, 'packages', 'RELEASES'), `${BOM}AAAA own_the_block-1.2.0-full.nupkg 11`, 'utf8');
}

const isUpdateCall = (call: SpawnCall) => call.args[0]?.startsWith('--update=') === true;

function squirrelInstaller(spawned: ReturnType<typeof fakeSpawn>, options: { timeoutMs?: number; log?: () => void } = {}) {
  return createSquirrelUpdateInstaller({
    updateExePath: updateExe,
    executableName: 'OwnTheBlock.exe',
    spawnProcess: spawned.spawnProcess,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.log ? { log: options.log } : {}),
  });
}

// Some file systems hand names back decomposed (macOS HFS+): compare them composed.
const entriesOf = async (directory: string) => (await readdir(directory)).map(name => name.normalize('NFC')).sort();

async function installIsAsItWas(): Promise<void> {
  expect(await entriesOf(installRoot)).toEqual(['Nguyễn Văn A', 'Update.exe', 'app-1.0.0', 'packages']);
  expect((await readdir(path.join(installRoot, 'packages'))).sort()).toEqual(['RELEASES', 'own_the_block-1.0.0-full.nupkg']);
  expect(await readFile(path.join(installRoot, 'packages', 'own_the_block-1.0.0-full.nupkg'), 'utf8')).toBe('old package');
  expect(await readFile(path.join(installRoot, 'packages', 'RELEASES'), 'utf8')).toBe(OLD_RELEASES);
}

describe('Squirrel in-place installer (Windows)', () => {
  it('applies the staged feed with Update.exe, then asks Update.exe to start the new version once this app has exited', async () => {
    const spawned = fakeSpawn(() => 'exit0', call => (isUpdateCall(call) ? unpackNewVersion() : Promise.resolve()));
    const installer = squirrelInstaller(spawned);

    expect(installer.mode).toBe('restart');
    expect(installer.payload).toBe('squirrel');
    expect(await installer.install(staged)).toEqual({ ok: true, quit: true });

    expect(spawned.calls).toHaveLength(2);
    // The update runs while the game is open, with no window and attached (the app waits for its exit code). It is
    // Squirrel's own Update.exe over the staged folder, never the downloaded Setup.exe: that one deletes the running version.
    expect(spawned.calls[0].command).toBe(updateExe);
    expect(spawned.calls[0].args).toEqual([`--update=${staged.directory}`]);
    expect(spawned.calls[0].options).toMatchObject({ stdio: 'ignore', windowsHide: true });
    expect(spawned.calls[0].options.detached).toBeUndefined();
    // The restart outlives this process and waits for it: Update.exe --processStartAndWait.
    expect(spawned.calls[1].command).toBe(updateExe);
    expect(spawned.calls[1].args).toEqual(['--processStartAndWait', 'OwnTheBlock.exe']);
    expect(spawned.calls[1].options).toMatchObject({ detached: true, stdio: 'ignore', windowsHide: true });
    expect(spawned.children[1].unref).toHaveBeenCalledOnce();
  });

  it('keeps what the update installed, drops its backups, and leaves the running version alone', async () => {
    const spawned = fakeSpawn(() => 'exit0', call => (isUpdateCall(call) ? unpackNewVersion() : Promise.resolve()));

    await squirrelInstaller(spawned).install(staged);

    expect(await entriesOf(installRoot)).toEqual(['Nguyễn Văn A', 'Update.exe', 'app-1.0.0', 'app-1.2.0', 'packages']);
    expect(await readFile(path.join(installRoot, 'app-1.2.0', 'OwnTheBlock.exe'), 'utf8')).toBe('new app');
    expect(await readFile(path.join(installRoot, 'app-1.0.0', 'OwnTheBlock.exe'), 'utf8')).toBe('running app');
  });

  it.each([
    ['a failed update', 'exit1' as const, 'INSTALL_FAILED'],
    ['an updater that could not be started (antivirus, permissions)', 'error' as const, 'INSTALL_START_FAILED'],
  ])('puts the install folder back as it was after %s, and does not start the restart helper', async (_label, behaviour, code) => {
    const spawned = fakeSpawn(() => behaviour, call => (isUpdateCall(call) ? leaveDebris() : Promise.resolve()));

    expect(await squirrelInstaller(spawned).install(staged)).toEqual({ ok: false, code });

    expect(spawned.calls).toHaveLength(1);
    await installIsAsItWas();
  });

  it('puts the folder back when the updater ends with 0 but the new version is not there (nothing was applied)', async () => {
    // Squirrel decides "no update" when its own bookkeeping says the version is installed: exit 0, nothing unpacked.
    const spawned = fakeSpawn(() => 'exit0');
    const log = vi.fn();

    expect(await squirrelInstaller(spawned, { log }).install(staged)).toEqual({ ok: false, code: 'INSTALL_FAILED' });

    expect(spawned.calls).toHaveLength(1);
    await installIsAsItWas();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('did not install 1.2.0'));
  });

  it('refuses an exit code of 0 whose version folder has no executable in it', async () => {
    const spawned = fakeSpawn(() => 'exit0', async call => {
      if (!isUpdateCall(call)) return;
      await leaveDebris();
    });

    expect(await squirrelInstaller(spawned).install(staged)).toEqual({ ok: false, code: 'INSTALL_FAILED' });
    await installIsAsItWas();
  });

  it('does not start an update it cannot undo: the install folder is not readable', async () => {
    await rm(path.join(installRoot, 'app-1.0.0'), { recursive: true });
    const spawned = fakeSpawn(() => 'exit0');

    expect(await squirrelInstaller(spawned).install(staged)).toEqual({ ok: false, code: 'INSTALL_START_FAILED' });
    expect(spawned.calls).toHaveLength(0);
  });

  it('reports a spawn that throws as a start failure, with the folder as it was', async () => {
    const spawned = fakeSpawn(() => 'throw');

    expect(await squirrelInstaller(spawned).install(staged)).toEqual({ ok: false, code: 'INSTALL_START_FAILED' });
    expect(spawned.calls).toHaveLength(1);
    await installIsAsItWas();
  });

  it('stops waiting for an updater that does not finish, without killing it and without undoing anything under its feet', async () => {
    const spawned = fakeSpawn(() => 'hang', call => (isUpdateCall(call) ? leaveDebris() : Promise.resolve()));

    expect(await squirrelInstaller(spawned, { timeoutMs: 30 }).install(staged)).toEqual({ ok: false, code: 'INSTALL_FAILED' });

    expect(spawned.calls).toHaveLength(1);
    expect((spawned.children[0] as unknown as { kill?: unknown }).kill).toBeUndefined();
    // The updater may still be writing: its folder is not removed while it runs.
    await Promise.all(spawned.effects);
    expect(await readdir(installRoot)).toContain('app-1.2.0');
  });

  it('still reports success when only the restart helper cannot be started: the new version is installed', async () => {
    const spawned = fakeSpawn((_call, index) => (index === 0 ? 'exit0' : 'throw'), call => (isUpdateCall(call) ? unpackNewVersion() : Promise.resolve()));

    expect(await squirrelInstaller(spawned).install(staged)).toEqual({ ok: true, quit: true });
  });
});

describe('open installer (macOS, and a Windows copy the installer did not install)', () => {
  const dmg: StagedUpdate = { directory: '/tmp/updates/1.2.0/installer', mainFile: '/tmp/updates/1.2.0/installer/Own the Block.dmg' };

  it('opens the installer file and does not quit', async () => {
    const openPath = vi.fn(() => Promise.resolve(''));
    const installer = createOpenInstaller({ openPath });

    expect(installer.mode).toBe('open-installer');
    expect(installer.payload).toBe('installer');
    expect(await installer.install(dmg)).toEqual({ ok: true, quit: false });
    expect(openPath).toHaveBeenCalledExactlyOnceWith(dmg.mainFile);
  });

  it('reports the failure Electron returns as a message, and a throw', async () => {
    const failing = createOpenInstaller({ openPath: () => Promise.resolve('No application knows how to open this file') });
    const throwing = createOpenInstaller({ openPath: () => Promise.reject(new Error('boom')) });

    expect(await failing.install(dmg)).toEqual({ ok: false, code: 'INSTALL_START_FAILED' });
    expect(await throwing.install(dmg)).toEqual({ ok: false, code: 'INSTALL_START_FAILED' });
  });
});

describe('installer selection', () => {
  const openPath = () => Promise.resolve('');
  const execPath = path.join('C:', 'Users', 'me', 'AppData', 'Local', 'own_the_block', 'app-1.2.0', 'OwnTheBlock.exe');

  it('finds Update.exe one folder above the versioned app folder', () => {
    expect(squirrelUpdateExePath(execPath)).toBe(path.resolve(execPath, '..', '..', 'Update.exe'));
  });

  it('updates in place through Squirrel on a Windows copy that has Update.exe', () => {
    const exists = vi.fn(() => true);
    const installer = selectInstaller({ platform: 'win32', execPath, openPath, exists });

    expect(installer?.mode).toBe('restart');
    expect(installer?.payload).toBe('squirrel');
    expect(exists).toHaveBeenCalledExactlyOnceWith(squirrelUpdateExePath(execPath));
  });

  it('opens the installer for a Windows copy without Update.exe (not installed by the installer)', () => {
    const installer = selectInstaller({ platform: 'win32', execPath, openPath, exists: () => false });

    expect(installer?.mode).toBe('open-installer');
    expect(installer?.payload).toBe('installer');
  });

  it('opens the disk image on macOS and offers nothing on other platforms', () => {
    const mac = selectInstaller({ platform: 'darwin', execPath: '/Applications/Own the Block.app/Contents/MacOS/Own the Block', openPath });

    expect(mac?.mode).toBe('open-installer');
    expect(mac?.payload).toBe('installer');
    expect(selectInstaller({ platform: 'linux', execPath: '/opt/own-the-block', openPath })).toBeUndefined();
  });
});
