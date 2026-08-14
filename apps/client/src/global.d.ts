import type { OwnTheBlockDesktopBridge } from './runtime/types';

declare global {
  // Injected by Vite's `define` (see vite.config.ts) at build time. Empty
  // string => connect to the same origin as the page.
  const __SOCKET_URL__: string;

  interface Window {
    ownTheBlockDesktop?: OwnTheBlockDesktopBridge;
  }
}

export {};
