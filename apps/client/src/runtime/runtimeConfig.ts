import { getDesktopBridge } from './desktopBridge';
import { normalizeLanEndpoint } from './lanEndpoint';
import { publicHttpsEndpoint } from './joinTargetResolver';
import type { DesktopRuntimeConfigErrorCode, RuntimeConfig } from './types';

export class RuntimeConfigLoadError extends Error {
  public constructor(public readonly code: DesktopRuntimeConfigErrorCode) {
    super('Desktop runtime configuration could not be loaded.');
  }
}

export function isRuntimeConfigLoadError(error: unknown): error is RuntimeConfigLoadError {
  return error instanceof RuntimeConfigLoadError;
}

function webRuntimeConfig(): RuntimeConfig {
  const socketUrl = typeof __SOCKET_URL__ !== 'undefined' ? __SOCKET_URL__ : '';
  const pageOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  return {
    target: 'web',
    socketUrl: webSocketUrlForPage(socketUrl, pageOrigin),
  };
}

export function webSocketUrlForPage(configured: string, pageOrigin: string): string | undefined {
  // A browser that loaded the desktop Host's bundled client must use that
  // same Host, even if this bundle was built with a separate web endpoint.
  if (normalizeLanEndpoint(pageOrigin) || publicHttpsEndpoint(pageOrigin)) return undefined;
  return configured || undefined;
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const bridge = getDesktopBridge();
  if (!bridge) return webRuntimeConfig();
  const result = await bridge.getRuntimeConfig();
  if (!result.ok) throw new RuntimeConfigLoadError(result.code);
  return result.config;
}

export function getDefaultWebRuntimeConfig(): RuntimeConfig {
  return webRuntimeConfig();
}

