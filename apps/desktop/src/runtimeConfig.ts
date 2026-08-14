import { app } from 'electron';

export interface DesktopRuntimeConfig {
  target: 'desktop';
  socketUrl: string;
  platform: 'win32' | 'darwin' | 'linux';
  appVersion: string;
}

function readSocketUrl(): string {
  const argument = process.argv.find(value => value.startsWith('--socket-url='));
  const configured = argument?.slice('--socket-url='.length).trim()
    || process.env.OWN_THE_BLOCK_SOCKET_URL?.trim()
    || 'http://127.0.0.1:8080';

  const parsed = new URL(configured);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('OWN_THE_BLOCK_SOCKET_URL must use http or https.');
  }
  return parsed.toString().replace(/\/$/, '');
}

export function getDesktopRuntimeConfig(): DesktopRuntimeConfig {
  return {
    target: 'desktop',
    socketUrl: readSocketUrl(),
    platform: process.platform === 'darwin' || process.platform === 'linux'
      ? process.platform
      : 'win32',
    appVersion: app.getVersion(),
  };
}

