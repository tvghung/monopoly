import { app } from 'electron';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  routeSquirrelStartup,
  runSquirrelLifecycle,
} from './squirrelEvents';

function handleSquirrelEvent(): boolean {
  if (process.platform !== 'win32') return false;

  const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
  const executableName = path.basename(process.execPath);
  const runUpdater = (args: string[]): void => {
    if (!existsSync(updateExe)) return;
    const child = spawn(updateExe, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', () => undefined);
    child.unref();
  };

  return runSquirrelLifecycle({
    argv: process.argv,
    platform: process.platform,
    executableName,
    runUpdater,
    quit: () => app.quit(),
  });
}

function startNormalDesktop(): void {
  void import('./desktopBootstrap.js').then(({ startDesktopRuntime }) => {
    startDesktopRuntime();
  }).catch(error => {
    console.error('Own the Block desktop failed to start.', error);
    app.quit();
  });
}

routeSquirrelStartup(handleSquirrelEvent, startNormalDesktop);
