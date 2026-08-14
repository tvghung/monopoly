import type { OwnTheBlockDesktopBridge } from './types';

export function getDesktopBridge(): OwnTheBlockDesktopBridge | undefined {
  return typeof window !== 'undefined' ? window.ownTheBlockDesktop : undefined;
}

export function isDesktopRuntime(): boolean {
  return getDesktopBridge() !== undefined;
}

