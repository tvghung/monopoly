import { app, BrowserWindow, protocol } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { installExternalNavigationGuards } from './ipc/externalLinks';
import { QuitRequestController, registerWindowHandlers } from './ipc/windowHandlers';
import { shouldBlockProductionInput } from './productionPolicy';
import { contentType } from './rendererContentType';
import { resolveRendererPath } from './security';
import { HostRuntimeController } from './hostRuntime';
import { LANDiscoveryController } from './lanDiscovery';

const DEV_RENDERER_URL = process.env.OWN_THE_BLOCK_DEV_RENDERER_URL?.trim()
  || 'http://127.0.0.1:5173';

let hostRuntime: HostRuntimeController | undefined;
let discovery: LANDiscoveryController | undefined;
let quitAfterRuntimeStop = false;

function createHostServices(): void {
  const generatedRoot = path.join(__dirname, '../generated');
  const resourcesRoot = app.isPackaged ? process.resourcesPath : generatedRoot;
  const targetKey = `${process.platform}-${process.arch}`;
  const postgresRoot = path.join(resourcesRoot, 'postgres', targetKey);
  const helperRoot = path.join(resourcesRoot, 'server-helper');
  discovery = new LANDiscoveryController({ appVersion: app.getVersion() });
  hostRuntime = new HostRuntimeController({
    resourceRoot: postgresRoot,
    helperPath: path.join(helperRoot, 'server-helper.cjs'),
    migrationDirectory: path.join(helperRoot, 'migrations'),
    userDataPath: app.getPath('userData'),
    appVersion: app.getVersion(),
    stopAdvertisement: () => discovery?.stopAdvertising(),
  });
}

function installRuntimeShutdown(): void {
  app.on('before-quit', event => {
    if (quitAfterRuntimeStop) return;
    const needsStop = hostRuntime?.status.state !== 'IDLE'
      || discovery?.status.browsing
      || discovery?.status.advertising;
    if (!needsStop) return;

    event.preventDefault();
    void (async () => {
      try {
        await hostRuntime?.stop();
      } finally {
        await discovery?.dispose();
      }
    })().catch(error => {
      console.error('Desktop host runtime shutdown failed.', error);
    }).finally(() => {
      quitAfterRuntimeStop = true;
      app.quit();
    });
  });
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
  registerWindowHandlers(
    window,
    development,
    quitController,
    hostRuntime && discovery ? { hostRuntime, discovery } : undefined,
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
    if (process.argv.includes('--phase7-1-lan-proof')) {
      void import('./phase71LanProof.js')
        .then(({ runPhase71LanProof }) => runPhase71LanProof())
        .then(result => {
          console.log(`Phase 7.1 packaged LAN proof ${result.status} ${JSON.stringify(result)}`);
          app.exit(0);
        })
        .catch(error => {
          console.error('Phase 7.1 packaged LAN proof failed.', error);
          app.exit(1);
        });
      return;
    }
    createHostServices();
    if (app.isPackaged) registerProductionRenderer();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  }).catch(error => {
    console.error('Own the Block desktop failed to start.', error);
    app.quit();
  });

  installRuntimeShutdown();

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
