import { app, BrowserWindow, net, powerMonitor, protocol, shell } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { installExternalNavigationGuards } from './ipc/externalLinks';
import { QuitRequestController, registerWindowHandlers } from './ipc/windowHandlers';
import { shouldBlockProductionInput } from './productionPolicy';
import { contentType, PRODUCTION_RENDERER_CSP } from './rendererContentType';
import { resolveRendererPath } from './security';
import { HostRuntimeController } from './hostRuntime';
import { AppQuitCoordinator } from './appQuitCoordinator';
import { audioRendererProofExitCode } from './audioRendererProofResult';
import { LanFinder } from './lanFinder';
import { probeDefaultRouteAddress } from './networkInterfaces';
import { selectInstaller } from './update/installers';
import { resolveUpdateEndpoints } from './update/updateConfig';
import { UpdateService } from './update/updateService';

const DEV_RENDERER_URL = process.env.OWN_THE_BLOCK_DEV_RENDERER_URL?.trim()
  || 'http://127.0.0.1:5173';

let hostRuntime: HostRuntimeController | undefined;
let lanFinder: LanFinder | undefined;
let quitController: QuitRequestController | undefined;
let updateService: UpdateService | undefined;

function createHostServices(): void {
  const generatedRoot = path.join(__dirname, '../generated');
  const resourcesRoot = app.isPackaged ? process.resourcesPath : generatedRoot;
  const targetKey = `${process.platform}-${process.arch}`;
  const postgresRoot = path.join(resourcesRoot, 'postgres', targetKey);
  const helperRoot = path.join(resourcesRoot, 'server-helper');
  hostRuntime = new HostRuntimeController({
    resourceRoot: postgresRoot,
    helperPath: path.join(helperRoot, 'server-helper.cjs'),
    migrationDirectory: path.join(helperRoot, 'migrations'),
    clientDist: rendererRoot(),
    userDataPath: app.getPath('userData'),
    appVersion: app.getVersion(),
    routeProbe: probeDefaultRouteAddress,
    registryUrl: process.env.OWN_THE_BLOCK_REGISTRY_URL,
    cloudflaredPath: process.env.OWN_THE_BLOCK_CLOUDFLARED_PATH,
  });
  lanFinder = new LanFinder();
}

/** A LAN room of this machine is open (or opening): restarting for an update would close it for everyone in it. */
function hostIsBusy(): boolean {
  const state = hostRuntime?.status.state;
  return state !== undefined && state !== 'IDLE' && state !== 'FAILED';
}

function createUpdateService(): UpdateService {
  const endpoints = resolveUpdateEndpoints({ packaged: app.isPackaged, env: process.env });
  const service = new UpdateService({
    currentVersion: app.getVersion(),
    platform: process.platform,
    architecture: process.arch,
    endpoints,
    installer: endpoints
      ? selectInstaller({
        platform: process.platform,
        execPath: process.execPath,
        openPath: filePath => shell.openPath(filePath),
        log: (message, error) => console.warn(message, error ?? ''),
      })
      : undefined,
    // The temp folder, not userData: userData is the roaming profile on Windows and this is a 160 MiB installer.
    updatesDirectory: path.join(app.getPath('temp'), 'OwnTheBlock-updates'),
    // Chromium's network stack, so the system proxy and certificates apply as they do in a browser.
    fetch: (input, init) => net.fetch(input instanceof URL ? input.href : input, init),
    isHostBusy: hostIsBusy,
    requestQuit: () => {
      // The player already chose to restart: the quit coordinator must not ask a second question.
      quitController?.approveApplicationQuit();
      app.quit();
    },
  });
  hostRuntime?.onStatusChanged(() => service.refreshSafety());
  return service;
}

async function stopRuntime(): Promise<void> {
  const needsStop = hostRuntime?.status.state !== 'IDLE';
  if (!needsStop) return;
  await hostRuntime?.stop();
}

function installRuntimeShutdown(): void {
  const coordinator = new AppQuitCoordinator({
    hasLiveWindow: () => BrowserWindow.getAllWindows().some(window => !window.isDestroyed()),
    requestRendererDecision: () => quitController?.requestApplicationQuit() ?? Promise.resolve(true),
    stopRuntime,
    armFinalWindowClose: () => quitController?.armNextClose(),
    quitApp: () => app.quit(),
    reportError: error => console.error('Desktop host runtime shutdown failed.', error),
  });
  app.on('before-quit', event => coordinator.handleBeforeQuit(event));
}

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
          'content-security-policy': PRODUCTION_RENDERER_CSP,
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
  const windowQuitController = new QuitRequestController(window);
  quitController = windowQuitController;
  window.on('close', event => windowQuitController.handleClose(event));
  registerWindowHandlers(
    window,
    development,
    windowQuitController,
    hostRuntime
      ? { hostRuntime, ...(lanFinder ? { lanFinder } : {}), ...(updateService ? { updateService } : {}) }
      : undefined,
  );
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

export function startDesktopRuntime(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  }]);

  app.whenReady().then(() => {
    if (process.argv.includes('--audio-renderer-proof')) {
      registerProductionRenderer();
      void import('./audioRendererProof.js')
        .then(({ runAudioRendererProof }) => runAudioRendererProof())
        .then(result => {
          console.log(`Packaged audio renderer proof RESULT ${JSON.stringify(result)}`);
          app.exit(audioRendererProofExitCode(result));
        })
        .catch(error => {
          console.error('Packaged audio renderer proof failed.', error);
          app.exit(1);
        });
      return;
    }
    if (process.argv.includes('--phase7-runtime-proof')) {
      void import('./phase7RuntimeProof.js')
        .then(({ runPhase7RuntimeProof }) => runPhase7RuntimeProof())
      .then(result => {
          console.log(`Phase 7 packaged runtime proof PASS ${JSON.stringify(result)}`);
          app.exit(0);
        })
        .catch(error => {
          console.error('Phase 7 packaged runtime proof failed.', error);
          app.exit(1);
        });
      return;
    }
    if (process.argv.includes('--phase7-2-host-proof')) {
      void import('./phase72HostProof.js')
        .then(({ runPhase72HostProof }) => runPhase72HostProof())
        .then(result => {
          console.log(`Phase 7.2 packaged Host proof PASS ${JSON.stringify(result)}`);
          app.exit(0);
        })
        .catch(error => {
          console.error('Phase 7.2 packaged Host proof failed.', error);
          app.exit(1);
        });
      return;
    }
    createHostServices();
    updateService = createUpdateService();
    powerMonitor.on('resume', () => {
      void hostRuntime?.verifyAndRecover().catch(error => {
        console.error('Desktop host recovery after resume failed.', error);
      });
    });
    if (app.isPackaged) registerProductionRenderer();
    createWindow();
    updateService.start();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  }).catch(error => {
    console.error('Own the Block desktop failed to start.', error);
    app.quit();
  });

  installRuntimeShutdown();
  app.on('will-quit', () => updateService?.dispose());

  app.on('window-all-closed', () => {
    if (process.argv.includes('--audio-renderer-proof')) return;
    if (process.platform !== 'darwin') app.quit();
  });
}
