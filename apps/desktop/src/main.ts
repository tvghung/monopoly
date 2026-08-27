import { app, BrowserWindow, protocol } from 'electron';
import { existsSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { installExternalNavigationGuards } from './ipc/externalLinks';
import { QuitRequestController, registerWindowHandlers } from './ipc/windowHandlers';
import { shouldBlockProductionInput } from './productionPolicy';
import { contentType } from './rendererContentType';
import { resolveRendererPath } from './security';
import {
  getSquirrelLifecycleExitDelayMs,
  resolveSquirrelEvent,
  SQUIRREL_UPDATER_MAX_WAIT_MS,
} from './squirrelEvents';

const DEV_RENDERER_URL = process.env.OWN_THE_BLOCK_DEV_RENDERER_URL?.trim()
  || 'http://127.0.0.1:5173';

function handleSquirrelEvent(): boolean {
  if (process.platform !== 'win32') return false;

  const event = resolveSquirrelEvent();
  if (!event) return false;

  const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
  const executableName = path.basename(process.execPath);
  const runUpdater = (args: string[]): ChildProcess | undefined => {
    if (!existsSync(updateExe)) return undefined;
    const child = spawn(updateExe, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', () => undefined);
    child.unref();
    return child;
  };

  let updater: ChildProcess | undefined;
  if (event === 'create-shortcut') {
    updater = runUpdater(['--createShortcut', executableName]);
  } else if (event === 'remove-shortcut') {
    updater = runUpdater(['--removeShortcut', executableName]);
    scheduleUninstallCleanup(path.dirname(updateExe));
  }

  scheduleSquirrelLifecycleQuit(event, updater);
  return true;
}

function scheduleSquirrelLifecycleQuit(
  event: NonNullable<ReturnType<typeof resolveSquirrelEvent>>,
  updater: ChildProcess | undefined,
): void {
  const exitDelayMs = getSquirrelLifecycleExitDelayMs(event);
  if (exitDelayMs === 0) {
    process.exit(0);
    return;
  }

  const startedAt = Date.now();
  let settled = false;
  let graceTimer: NodeJS.Timeout | undefined;
  const maxTimer = setTimeout(() => {
    if (settled) return;
    settled = true;
    process.exit(0);
  }, SQUIRREL_UPDATER_MAX_WAIT_MS);

  const quitAfterGrace = (): void => {
    if (settled) return;
    const remainingMs = exitDelayMs - (Date.now() - startedAt);
    if (remainingMs > 0) {
      graceTimer = setTimeout(quitAfterGrace, remainingMs);
      return;
    }
    settled = true;
    clearTimeout(maxTimer);
    process.exit(0);
  };

  if (!updater || updater.exitCode !== null || updater.signalCode !== null) {
    quitAfterGrace();
  } else {
    updater.once('close', quitAfterGrace);
  }

  if (settled && graceTimer) clearTimeout(graceTimer);
}

function scheduleUninstallCleanup(rootAppDirectory: string): void {
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
  const powershell = path.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  if (!existsSync(powershell)) return;

  const cleanupScript = [
    `$root = '${rootAppDirectory.replace(/'/g, "''")}'`,
    `$hookPid = ${process.pid}`,
    'try { Wait-Process -Id $hookPid -Timeout 15 -ErrorAction SilentlyContinue } catch {}',
    'Start-Sleep -Milliseconds 250',
    'for ($attempt = 0; $attempt -lt 60; $attempt++) {',
    '  if (-not (Test-Path -LiteralPath $root)) { break }',
    '  try { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction Stop } catch {}',
    '  if (-not (Test-Path -LiteralPath $root)) { break }',
    '  Start-Sleep -Milliseconds 250',
    '}',
  ].join('; ');
  const encodedCleanupScript = Buffer.from(cleanupScript, 'utf16le').toString('base64');

  const child = spawn(powershell, [
    '-NoProfile',
    '-NonInteractive',
    '-WindowStyle',
    'Hidden',
    '-EncodedCommand',
    encodedCleanupScript,
  ], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.once('error', () => undefined);
  child.unref();
}

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

function rendererRoot(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'dist');
  return path.resolve(__dirname, '../../client/dist');
}

function registerProductionRenderer(): void {
  const root = rendererRoot();
  protocol.handle('app', async request => {
    const filePath = await resolveRendererPath(root, request.url);
    if (!filePath) return new Response('Not found', { status: 404 });
    try {
      const body = await readFile(filePath);
      return new Response(body, {
        headers: {
          'content-type': contentType(filePath),
          'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http: https: ws: wss:;",
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function createWindow(): BrowserWindow {
  const development = !app.isPackaged;
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: development,
    },
  });

  window.webContents.on('before-input-event', (event, input) => {
    if (!development && shouldBlockProductionInput(input)) event.preventDefault();
  });
  window.webContents.on('devtools-opened', () => {
    if (!development) window.webContents.closeDevTools();
  });
  const quitController = new QuitRequestController(window);
  window.on('close', event => quitController.handleClose(event));
  registerWindowHandlers(window, development, quitController);
  installExternalNavigationGuards(window, development);

  const phase4Uat = process.argv.includes('--phase4-uat')
    || process.env.OWN_THE_BLOCK_PHASE4_UAT === '1';
  if (development) void window.loadURL(
    phase4Uat ? `${DEV_RENDERER_URL}?phase4-uat=1` : DEV_RENDERER_URL,
  );
  else void window.loadURL(
    phase4Uat
      ? 'app://own-the-block/index.html?phase4-uat=1'
      : 'app://own-the-block/index.html',
  );
  return window;
}

if (!handleSquirrelEvent()) {
  app.whenReady().then(() => {
    if (app.isPackaged) registerProductionRenderer();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  }).catch(error => {
    console.error('Own the Block desktop failed to start.', error);
    app.quit();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
