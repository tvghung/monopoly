import { EventEmitter } from 'node:events';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { squirrelUpdateExePath } from '../src/squirrelEvents';
import {
  createOpenInstaller,
  createSquirrelSilentInstaller,
  selectInstaller,
} from '../src/update/installers';

type SpawnCall = { command: string; args: readonly string[]; options: Record<string, unknown> };

class FakeChild extends EventEmitter {
  public readonly unref = vi.fn();
}

/**
 * A spawn double. `script` decides, per call, what the child does: exit with a code, fail to start, or never end.
 */
function fakeSpawn(script: (call: SpawnCall, index: number) => 'exit0' | 'exit1' | 'error' | 'hang' | 'throw') {
  const calls: SpawnCall[] = [];
  const children: FakeChild[] = [];
  const spawnProcess = ((command: string, args: readonly string[], options: Record<string, unknown>) => {
    const call = { command, args, options };
    const index = calls.length;
    calls.push(call);
    const behaviour = script(call, index);
    if (behaviour === 'throw') throw new Error('spawn failed synchronously');
    const child = new FakeChild();
    children.push(child);
    queueMicrotask(() => {
      if (behaviour === 'exit0') child.emit('exit', 0);
      else if (behaviour === 'exit1') child.emit('exit', 1);
      else if (behaviour === 'error') child.emit('error', new Error('spawn EPERM'));
    });
    return child;
  }) as never;
  return { spawnProcess, calls, children };
}

const SETUP = path.join('C:', 'temp', 'updates', '1.2.0', 'OwnTheBlock-1.2.0-win32-x64-Setup.exe');
const UPDATE_EXE = path.join('C:', 'Users', 'me', 'AppData', 'Local', 'own_the_block', 'Update.exe');

describe('Squirrel silent installer (Windows)', () => {
  it('runs the downloaded Setup.exe silently, then asks Update.exe to start the new version once this app has exited', async () => {
    const spawned = fakeSpawn(() => 'exit0');
    const installer = createSquirrelSilentInstaller({
      updateExePath: UPDATE_EXE,
      executableName: 'OwnTheBlock.exe',
      spawnProcess: spawned.spawnProcess,
    });

    expect(installer.mode).toBe('restart');
    expect(await installer.install(SETUP)).toEqual({ ok: true, quit: true });

    expect(spawned.calls).toHaveLength(2);
    // The installer runs while the game is open, with no window and attached (the app waits for its exit code).
    expect(spawned.calls[0].command).toBe(SETUP);
    expect(spawned.calls[0].args).toEqual(['--silent']);
    expect(spawned.calls[0].options).toMatchObject({ stdio: 'ignore', windowsHide: true });
    expect(spawned.calls[0].options.detached).toBeUndefined();
    // The restart outlives this process and waits for it: Update.exe --processStartAndWait.
    expect(spawned.calls[1].command).toBe(UPDATE_EXE);
    expect(spawned.calls[1].args).toEqual(['--processStartAndWait', 'OwnTheBlock.exe']);
    expect(spawned.calls[1].options).toMatchObject({ detached: true, stdio: 'ignore', windowsHide: true });
    expect(spawned.children[1].unref).toHaveBeenCalledOnce();
  });

  it('reports a failed install and does not start the restart helper', async () => {
    const spawned = fakeSpawn(() => 'exit1');
    const installer = createSquirrelSilentInstaller({
      updateExePath: UPDATE_EXE, executableName: 'OwnTheBlock.exe', spawnProcess: spawned.spawnProcess,
    });

    expect(await installer.install(SETUP)).toEqual({ ok: false, code: 'INSTALL_FAILED' });
    expect(spawned.calls).toHaveLength(1);
  });

  it('reports an installer that could not be started (antivirus, permissions)', async () => {
    for (const behaviour of ['error', 'throw'] as const) {
      const spawned = fakeSpawn(() => behaviour);
      const installer = createSquirrelSilentInstaller({
        updateExePath: UPDATE_EXE, executableName: 'OwnTheBlock.exe', spawnProcess: spawned.spawnProcess,
      });

      expect(await installer.install(SETUP)).toEqual({ ok: false, code: 'INSTALL_START_FAILED' });
      expect(spawned.calls).toHaveLength(1);
    }
  });

  it('stops waiting for an installer that does not finish, without killing it', async () => {
    const spawned = fakeSpawn(() => 'hang');
    const installer = createSquirrelSilentInstaller({
      updateExePath: UPDATE_EXE, executableName: 'OwnTheBlock.exe', spawnProcess: spawned.spawnProcess, timeoutMs: 30,
    });

    expect(await installer.install(SETUP)).toEqual({ ok: false, code: 'INSTALL_FAILED' });
    expect(spawned.calls).toHaveLength(1);
    expect((spawned.children[0] as unknown as { kill?: unknown }).kill).toBeUndefined();
  });

  it('still reports success when only the restart helper cannot be started: the new version is installed', async () => {
    const spawned = fakeSpawn((_call, index) => (index === 0 ? 'exit0' : 'throw'));
    const installer = createSquirrelSilentInstaller({
      updateExePath: UPDATE_EXE, executableName: 'OwnTheBlock.exe', spawnProcess: spawned.spawnProcess,
    });

    expect(await installer.install(SETUP)).toEqual({ ok: true, quit: true });
  });
});

describe('open installer (macOS, and a Windows copy the installer did not install)', () => {
  it('opens the installer and does not quit', async () => {
    const openPath = vi.fn(() => Promise.resolve(''));
    const installer = createOpenInstaller({ openPath });

    expect(installer.mode).toBe('open-installer');
    expect(await installer.install('/tmp/Own the Block.dmg')).toEqual({ ok: true, quit: false });
    expect(openPath).toHaveBeenCalledExactlyOnceWith('/tmp/Own the Block.dmg');
  });

  it('reports the failure Electron returns as a message, and a throw', async () => {
    const failing = createOpenInstaller({ openPath: () => Promise.resolve('No application knows how to open this file') });
    const throwing = createOpenInstaller({ openPath: () => Promise.reject(new Error('boom')) });

    expect(await failing.install('x.dmg')).toEqual({ ok: false, code: 'INSTALL_START_FAILED' });
    expect(await throwing.install('x.dmg')).toEqual({ ok: false, code: 'INSTALL_START_FAILED' });
  });
});

describe('installer selection', () => {
  const openPath = () => Promise.resolve('');
  const execPath = path.join('C:', 'Users', 'me', 'AppData', 'Local', 'own_the_block', 'app-1.2.0', 'OwnTheBlock.exe');

  it('finds Update.exe one folder above the versioned app folder', () => {
    expect(squirrelUpdateExePath(execPath)).toBe(path.resolve(execPath, '..', '..', 'Update.exe'));
  });

  it('restarts through Squirrel on a Windows copy that has Update.exe', () => {
    const exists = vi.fn(() => true);
    const installer = selectInstaller({ platform: 'win32', execPath, openPath, exists });

    expect(installer?.mode).toBe('restart');
    expect(exists).toHaveBeenCalledExactlyOnceWith(squirrelUpdateExePath(execPath));
  });

  it('opens the installer for a Windows copy without Update.exe (not installed by the installer)', () => {
    expect(selectInstaller({ platform: 'win32', execPath, openPath, exists: () => false })?.mode).toBe('open-installer');
  });

  it('opens the disk image on macOS and offers nothing on other platforms', () => {
    expect(selectInstaller({ platform: 'darwin', execPath: '/Applications/Own the Block.app/Contents/MacOS/Own the Block', openPath })?.mode)
      .toBe('open-installer');
    expect(selectInstaller({ platform: 'linux', execPath: '/opt/own-the-block', openPath })).toBeUndefined();
  });
});
