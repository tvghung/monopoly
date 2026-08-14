import { shell } from 'electron';
import type { BrowserWindow } from 'electron';
import { isAllowedRendererNavigation, isSafeExternalUrl } from '../security';

export function installExternalNavigationGuards(
  window: BrowserWindow,
  development: boolean,
): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url, development)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (!development) {
      event.preventDefault();
      return;
    }
    if (isAllowedRendererNavigation(url, development)) return;
    event.preventDefault();
    if (isSafeExternalUrl(url, development)) void shell.openExternal(url);
  });
}

export function openExternalUrl(rawUrl: string, development: boolean): Promise<void> {
  if (!isSafeExternalUrl(rawUrl, development)) {
    return Promise.reject(new Error('Only validated external URLs may be opened.'));
  }
  return shell.openExternal(rawUrl);
}
