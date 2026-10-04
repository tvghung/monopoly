import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { squirrelUpdateExePath } from '../squirrelEvents';
import { INSTALL_TIMEOUT_MS } from './updateConfig';
import type { AppUpdateInstallMode } from './updateTypes';

export type InstallFailureCode = 'INSTALL_FAILED' | 'INSTALL_START_FAILED';

export type InstallOutcome =
  /** `quit`: the installed version can only start once this app has exited, so the caller must quit now. */
  | { ok: true; quit: boolean }
  | { ok: false; code: InstallFailureCode };

export interface UpdateInstaller {
  readonly mode: AppUpdateInstallMode;
  install(filePath: string): Promise<InstallOutcome>;
}

type SpawnProcess = typeof spawn;

type ExitResult =
  | { kind: 'exit'; code: number | null }
  | { kind: 'error' }
  | { kind: 'timeout' };

function runUntilExit(
  spawnProcess: SpawnProcess,
  command: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<ExitResult> {
  return new Promise(resolve => {
    let settled = false;
    // The wait ends, but the installer is not killed: half an install is worse than a slow one.
    const timer = setTimeout(() => finish({ kind: 'timeout' }), timeoutMs);
    const finish = (result: ExitResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    let child;
    try {
      child = spawnProcess(command, args, { stdio: 'ignore', windowsHide: true });
    } catch {
      finish({ kind: 'error' });
      return;
    }
    child.once('error', () => finish({ kind: 'error' }));
    child.once('exit', code => finish({ kind: 'exit', code }));
  });
}

export interface SquirrelInstallerOptions {
  /** `Update.exe` that Squirrel put next to the versioned app folder. */
  updateExePath: string;
  /** The executable the next launch starts (`OwnTheBlock.exe`). */
  executableName: string;
  spawnProcess?: SpawnProcess;
  timeoutMs?: number;
}

/**
 * Windows, installed by the Squirrel `Setup.exe`: the downloaded installer is the same file a player would run by hand,
 * run silently while the game is still open. Squirrel installs the new version into its own `app-<version>` folder next to
 * the running one (the running folder is left alone), so a failure leaves the working game untouched and reportable.
 *
 * A silent install does not start the app, and `app.relaunch` would start the old executable, so the restart is Squirrel's
 * own `Update.exe --processStartAndWait`: it waits for this process to exit and then starts the newest installed version.
 */
export function createSquirrelSilentInstaller(options: SquirrelInstallerOptions): UpdateInstaller {
  const spawnProcess = options.spawnProcess ?? spawn;
  return {
    mode: 'restart',
    async install(filePath) {
      const result = await runUntilExit(spawnProcess, filePath, ['--silent'], options.timeoutMs ?? INSTALL_TIMEOUT_MS);
      if (result.kind === 'error') return { ok: false, code: 'INSTALL_START_FAILED' };
      if (result.kind === 'timeout' || result.code !== 0) return { ok: false, code: 'INSTALL_FAILED' };
      try {
        const relauncher = spawnProcess(
          options.updateExePath,
          ['--processStartAndWait', options.executableName],
          { detached: true, stdio: 'ignore', windowsHide: true },
        );
        relauncher.once('error', () => undefined);
        relauncher.unref();
      } catch {
        // The new version is installed; if it does not start by itself the player opens the game again.
      }
      return { ok: true, quit: true };
    },
  };
}

export interface OpenInstallerOptions {
  /** Electron's `shell.openPath`: resolves with an error message, or an empty string when the file was opened. */
  openPath: (filePath: string) => Promise<string>;
}

/**
 * macOS (its builds are not signed, so the app cannot replace itself) and a Windows copy that was not installed by the
 * installer: the verified installer is opened for the player to finish, a disk image to drag from, or the Setup wizard.
 */
export function createOpenInstaller(options: OpenInstallerOptions): UpdateInstaller {
  return {
    mode: 'open-installer',
    async install(filePath) {
      try {
        const failure = await options.openPath(filePath);
        return failure ? { ok: false, code: 'INSTALL_START_FAILED' } : { ok: true, quit: false };
      } catch {
        return { ok: false, code: 'INSTALL_START_FAILED' };
      }
    },
  };
}

export interface SelectInstallerOptions {
  platform: NodeJS.Platform;
  /** `process.execPath` of the running app. */
  execPath: string;
  openPath: (filePath: string) => Promise<string>;
  exists?: (filePath: string) => boolean;
  spawnProcess?: SpawnProcess;
}

/** The way this machine applies an update, or undefined when it has none (an unsupported platform). */
export function selectInstaller(options: SelectInstallerOptions): UpdateInstaller | undefined {
  if (options.platform === 'win32') {
    const updateExePath = squirrelUpdateExePath(options.execPath);
    if ((options.exists ?? existsSync)(updateExePath)) {
      return createSquirrelSilentInstaller({
        updateExePath,
        executableName: path.basename(options.execPath),
        ...(options.spawnProcess ? { spawnProcess: options.spawnProcess } : {}),
      });
    }
    return createOpenInstaller({ openPath: options.openPath });
  }
  if (options.platform === 'darwin') return createOpenInstaller({ openPath: options.openPath });
  return undefined;
}
