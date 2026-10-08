export const IPC_CHANNELS = {
  runtimeConfig: 'ownTheBlock:runtime-config',
  windowGetState: 'ownTheBlock:window:get-state',
  windowSetFullscreen: 'ownTheBlock:window:set-fullscreen',
  windowToggleFullscreen: 'ownTheBlock:window:toggle-fullscreen',
  windowFullscreenChanged: 'ownTheBlock:window:fullscreen-changed',
  quitRequested: 'ownTheBlock:quit:requested',
  quitResponse: 'ownTheBlock:quit:response',
  quitExit: 'ownTheBlock:quit:exit',
  openExternal: 'ownTheBlock:open-external',
  hostGetStatus: 'ownTheBlock:host:get-status',
  hostStart: 'ownTheBlock:host:start',
  hostStop: 'ownTheBlock:host:stop',
  hostRefreshNetwork: 'ownTheBlock:host:refresh-network',
  hostStatusChanged: 'ownTheBlock:host:status-changed',
  hostActivateOnline: 'ownTheBlock:host:activate-online',
  onlineFindRoom: 'ownTheBlock:online:find-room',
  lanFindRoom: 'ownTheBlock:lan:find-room',
  updateGetState: 'ownTheBlock:update:get-state',
  updateCheck: 'ownTheBlock:update:check',
  updateDownload: 'ownTheBlock:update:download',
  updateCancel: 'ownTheBlock:update:cancel',
  updateInstall: 'ownTheBlock:update:install',
  updateStateChanged: 'ownTheBlock:update:state-changed',
} as const;

export interface DesktopWindowState {
  fullscreen: boolean;
  maximized: boolean;
  resizable: boolean;
}

export function isQuitRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
}

