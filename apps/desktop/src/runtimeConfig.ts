import { app } from 'electron';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const LOOPBACK_SOCKET_URL = 'http://127.0.0.1:8080';
const SOCKET_URL_ARGUMENT_PREFIX = '--socket-url=';
export const RELEASE_CONFIG_FILE_NAME = 'release-config.json';

export type DesktopRuntimeConfigErrorCode =
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
  packagedConfig?: DesktopReleaseConfig;
}

export interface DesktopReleaseConfig {
  socketUrl?: unknown;
  version?: unknown;
}

export interface DesktopRuntimeConfig {
  target: 'desktop';
  socketUrl?: string;
  platform: 'win32' | 'darwin' | 'linux';
  appVersion: string;
}

export type DesktopRuntimeConfigResult =
  | { ok: true; config: DesktopRuntimeConfig }
  | { ok: false; code: DesktopRuntimeConfigErrorCode };

function invalidSocketUrl(cause?: unknown): DesktopRuntimeConfigError {
  return new DesktopRuntimeConfigError(
    'SOCKET_URL_INVALID',
    'Desktop socket endpoint must be an absolute http or https URL.',
    cause === undefined ? undefined : { cause },
  );
}

function normalizeSocketUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw invalidSocketUrl();

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch (cause) {
    throw invalidSocketUrl(cause);
  }

  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
    throw invalidSocketUrl();
  }
  return parsed.toString().replace(/\/$/, '');
}

function packagedReleaseConfigPath(): string {
  return path.join(process.resourcesPath, RELEASE_CONFIG_FILE_NAME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readPackagedReleaseConfig(configPath: string): DesktopReleaseConfig | undefined {
  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw invalidSocketUrl(error);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw invalidSocketUrl(cause);
  }
  if (!isRecord(parsed)) throw invalidSocketUrl();
  return parsed;
}

function explicitEnvironmentValue(env: NodeJS.ProcessEnv): string | undefined {
  return Object.prototype.hasOwnProperty.call(env, 'OWN_THE_BLOCK_SOCKET_URL')
    ? env.OWN_THE_BLOCK_SOCKET_URL
    : undefined;
}

export function resolveSocketUrl({
  isPackaged,
  argv = process.argv,
  env = process.env,
  packagedConfig,
}: DesktopSocketUrlOptions): string | undefined {
  const argument = argv.find(value => value.startsWith(SOCKET_URL_ARGUMENT_PREFIX));
  const configured = argument !== undefined
    ? argument.slice(SOCKET_URL_ARGUMENT_PREFIX.length).trim()
    : explicitEnvironmentValue(env)?.trim()
      ?? packagedConfig?.socketUrl;

  if (configured === undefined) {
    return isPackaged ? undefined : LOOPBACK_SOCKET_URL;
  }

  return normalizeSocketUrl(configured);
}

export function getReleaseConfigPath(isPackaged = app.isPackaged): string {
  return isPackaged
    ? packagedReleaseConfigPath()
    : path.resolve(__dirname, '../generated', RELEASE_CONFIG_FILE_NAME);
}

export function getDesktopRuntimeConfig(): DesktopRuntimeConfig {
  const isPackaged = app.isPackaged;
  const packagedConfig = isPackaged
    ? readPackagedReleaseConfig(getReleaseConfigPath(true))
    : undefined;
  return {
    target: 'desktop',
    socketUrl: resolveSocketUrl({ isPackaged, packagedConfig }),
    platform: process.platform === 'darwin' || process.platform === 'linux'
      ? process.platform
      : 'win32',
    appVersion: app.getVersion(),
  };
}

