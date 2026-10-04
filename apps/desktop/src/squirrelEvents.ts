import path from 'node:path';

export type SquirrelEventAction = 'create-shortcut' | 'remove-shortcut' | 'quit';

/** Squirrel puts `Update.exe` one folder above the versioned `app-<version>` folder that holds the running executable. */
export function squirrelUpdateExePath(execPath: string): string {
  return path.resolve(path.dirname(execPath), '..', 'Update.exe');
}

export interface SquirrelLifecycleOptions {
  argv?: readonly string[];
  platform?: NodeJS.Platform;
  executableName: string;
  runUpdater: (args: string[]) => void;
  quit: () => void;
  scheduleQuit?: (callback: () => void, delayMs: number) => void;
}

export const SQUIRREL_UPDATER_GRACE_MS = 1_000;
export const SQUIRREL_UPDATER_MAX_WAIT_MS = 5_000;

export function resolveSquirrelEvent(
  argv: readonly string[] = process.argv,
  platform: NodeJS.Platform = process.platform,
): SquirrelEventAction | undefined {
  if (platform !== 'win32') return undefined;

  const event = argv.find(value => value.startsWith('--squirrel-'));
  if (!event) return undefined;
  // Squirrel starts the app with this right after a (non-silent) install, and asks for a normal run: the Squirrel docs
  // list it as the one event that is not a hook to answer and quit. Treating it as a hook made the game vanish right after
  // the installer finished, including when an update was installed by running the new Setup.exe.
  if (event === '--squirrel-firstrun') return undefined;
  if (event === '--squirrel-install' || event === '--squirrel-updated') {
    return 'create-shortcut';
  }
  if (event === '--squirrel-uninstall') return 'remove-shortcut';
  return 'quit';
}

export function getSquirrelLifecycleExitDelayMs(action: SquirrelEventAction): number {
  return action === 'quit' ? 0 : SQUIRREL_UPDATER_GRACE_MS;
}

export function getSquirrelUpdaterArgs(
  action: SquirrelEventAction,
  executableName: string,
): string[] | undefined {
  if (action === 'create-shortcut') return ['--createShortcut', executableName];
  if (action === 'remove-shortcut') return ['--removeShortcut', executableName];
  return undefined;
}

export function runSquirrelLifecycle({
  argv = process.argv,
  platform = process.platform,
  executableName,
  runUpdater,
  quit,
  scheduleQuit = (callback, delayMs) => {
    setTimeout(callback, delayMs);
  },
}: SquirrelLifecycleOptions): boolean {
  const action = resolveSquirrelEvent(argv, platform);
  if (!action) return false;

  const updaterArgs = getSquirrelUpdaterArgs(action, executableName);
  if (updaterArgs) runUpdater(updaterArgs);
  scheduleQuit(quit, getSquirrelLifecycleExitDelayMs(action));
  return true;
}

export function routeSquirrelStartup(
  handleSquirrelEvent: () => boolean,
  startNormalDesktop: () => void,
): 'squirrel' | 'normal' {
  if (handleSquirrelEvent()) return 'squirrel';
  startNormalDesktop();
  return 'normal';
}
