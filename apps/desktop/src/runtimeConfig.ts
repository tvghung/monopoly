import { app } from 'electron';

const LOOPBACK_SOCKET_URL = 'http://127.0.0.1:8080';
const SOCKET_URL_ARGUMENT_PREFIX = '--socket-url=';

export type DesktopRuntimeConfigErrorCode =
  | 'PACKAGED_SOCKET_URL_MISSING'
  | 'SOCKET_URL_INVALID';

export class DesktopRuntimeConfigError extends Error {
  public constructor(
    public readonly code: DesktopRuntimeConfigErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DesktopRuntimeConfigError';
  }
}

export interface DesktopSocketUrlOptions {
  isPackaged: boolean;
  argv?: readonly string[];
  env?: NodeJS.ProcessEnv;
}

export interface DesktopRuntimeConfig {
  target: 'desktop';
  socketUrl: string;
  platform: 'win32' | 'darwin' | 'linux';
  appVersion: string;
}

export function resolveSocketUrl({
  isPackaged,
  argv = process.argv,
  env = process.env,
}: DesktopSocketUrlOptions): string {
  const argument = argv.find(value => value.startsWith(SOCKET_URL_ARGUMENT_PREFIX));
  const configured = argument?.slice(SOCKET_URL_ARGUMENT_PREFIX.length).trim()
    || env.OWN_THE_BLOCK_SOCKET_URL?.trim();

  if (!configured) {
    if (isPackaged) {
      throw new DesktopRuntimeConfigError(
        'PACKAGED_SOCKET_URL_MISSING',
        'Packaged desktop requires an explicitly supplied socket endpoint.',
      );
    }
    return LOOPBACK_SOCKET_URL;
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch (cause) {
    throw new DesktopRuntimeConfigError(
      'SOCKET_URL_INVALID',
      'Desktop socket endpoint must be an absolute http or https URL.',
      { cause },
    );
  }

  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
    throw new DesktopRuntimeConfigError(
      'SOCKET_URL_INVALID',
      'Desktop socket endpoint must be an absolute http or https URL.',
    );
  }
  return parsed.toString().replace(/\/$/, '');
}

export function getDesktopRuntimeConfig(): DesktopRuntimeConfig {
  return {
    target: 'desktop',
    socketUrl: resolveSocketUrl({ isPackaged: app.isPackaged }),
    platform: process.platform === 'darwin' || process.platform === 'linux'
      ? process.platform
      : 'win32',
    appVersion: app.getVersion(),
  };
}

