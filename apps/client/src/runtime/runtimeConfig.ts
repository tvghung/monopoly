import { getDesktopBridge } from './desktopBridge';
import type { RuntimeConfig } from './types';

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
  return bridge.getRuntimeConfig();
}

export function getDefaultWebRuntimeConfig(): RuntimeConfig {
  return webRuntimeConfig();
}

