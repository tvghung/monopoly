export const IPC_CHANNELS = {
  runtimeConfig: 'ownTheBlock:runtime-config',
  windowGetState: 'ownTheBlock:window:get-state',
  windowSetFullscreen: 'ownTheBlock:window:set-fullscreen',
  windowToggleFullscreen: 'ownTheBlock:window:toggle-fullscreen',
  windowFullscreenChanged: 'ownTheBlock:window:fullscreen-changed',
  quitRequested: 'ownTheBlock:quit:requested',
  quitResponse: 'ownTheBlock:quit:response',
  openExternal: 'ownTheBlock:open-external',
  hostGetStatus: 'ownTheBlock:host:get-status',
  hostStart: 'ownTheBlock:host:start',
  hostStop: 'ownTheBlock:host:stop',
  hostStatusChanged: 'ownTheBlock:host:status-changed',
  lanGetInterfaces: 'ownTheBlock:lan:get-interfaces',
  discoveryStartBrowsing: 'ownTheBlock:discovery:start-browsing',
  discoveryStopBrowsing: 'ownTheBlock:discovery:stop-browsing',
  discoveryGetGames: 'ownTheBlock:discovery:get-games',
  discoveryGamesChanged: 'ownTheBlock:discovery:games-changed',
  discoveryStartAdvertising: 'ownTheBlock:discovery:start-advertising',
  discoveryStopAdvertising: 'ownTheBlock:discovery:stop-advertising',
} as const;

export interface DesktopWindowState {
  fullscreen: boolean;
  maximized: boolean;
  resizable: boolean;
}

export function isQuitRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
}

