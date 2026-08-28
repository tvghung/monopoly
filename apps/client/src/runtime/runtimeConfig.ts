import { getDesktopBridge } from './desktopBridge';
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
  return {
    target: 'web',
    socketUrl: socketUrl || undefined,
  };
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

