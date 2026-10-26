import { app } from 'electron';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  loopbackAcceptanceEnvironment,
  parseLoopbackAcceptanceArguments,
  prepareLoopbackAcceptanceProfile,
  type LoopbackAcceptanceConfig,
} from './localAcceptance';
import {
  routeSquirrelStartup,
  runSquirrelLifecycle,
  squirrelUpdateExePath,
} from './squirrelEvents';

function handleSquirrelEvent(): boolean {
  if (process.platform !== 'win32') return false;

  const updateExe = squirrelUpdateExePath(process.execPath);
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

function startNormalDesktop(localAcceptance?: LoopbackAcceptanceConfig): void {
  void import('./desktopBootstrap.js').then(({ startDesktopRuntime }) => {
    startDesktopRuntime(localAcceptance);
  }).catch(error => {
    console.error('Own the Block desktop failed to start.', error);
    app.quit();
  });
}

let localAcceptance: LoopbackAcceptanceConfig | undefined;
let startupAllowed = true;
try {
  const parsed = parseLoopbackAcceptanceArguments(process.argv);
  if (parsed.enabled) {
    localAcceptance = prepareLoopbackAcceptanceProfile(parsed.profileRoot, app.getPath('userData'));
    app.setPath('appData', localAcceptance.profile.appData);
    app.setPath('userData', localAcceptance.profile.userData);
    app.setPath('sessionData', localAcceptance.profile.sessionData);
    app.setPath('logs', localAcceptance.profile.logs);
    app.setPath('temp', localAcceptance.profile.temp);
    app.setPath('userCache', localAcceptance.profile.userCache);
    app.setPath('crashDumps', localAcceptance.profile.crashDumps);
    const isolatedEnvironment = loopbackAcceptanceEnvironment(process.env, localAcceptance.profile);
    for (const name of Object.keys(process.env)) delete process.env[name];
    Object.assign(process.env, isolatedEnvironment);
    console.log(`Loopback acceptance mode active; profile=${localAcceptance.profile.root}; updater=disabled.`);
  }
} catch (error) {
  startupAllowed = false;
  console.error('Loopback acceptance startup failed closed.', error);
  app.exit(1);
}

if (startupAllowed) {
  if (localAcceptance) startNormalDesktop(localAcceptance);
  else routeSquirrelStartup(handleSquirrelEvent, startNormalDesktop);
}
