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
  hostRefreshNetwork: 'ownTheBlock:host:refresh-network',
  hostStatusChanged: 'ownTheBlock:host:status-changed',
} as const;

export interface DesktopWindowState {
  fullscreen: boolean;
  maximized: boolean;
  resizable: boolean;
}

export function isQuitRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
}

