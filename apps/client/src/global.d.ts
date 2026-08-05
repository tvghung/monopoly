// Injected by Vite's `define` (see vite.config.ts) at build time. Empty string
// => connect to the same origin as the page.
declare const __SOCKET_URL__: string;

// These packages ship no type declarations.
declare module 'react-alert-template-basic';

declare module 'react-alert' {
  import type { ComponentType, ReactNode } from 'react';

  export const positions: Record<string, string>;
  export const transitions: Record<string, string>;
  export const types: Record<string, string>;

  export interface AlertManager {
    show: (message?: ReactNode, options?: Record<string, unknown>) => void;
    info: (message?: ReactNode, options?: Record<string, unknown>) => void;
    success: (message?: ReactNode, options?: Record<string, unknown>) => void;
    error: (message?: ReactNode, options?: Record<string, unknown>) => void;
    remove: (alert: unknown) => void;
  }

  export function useAlert(): AlertManager;

  export interface ProviderProps {
    template: ComponentType<Record<string, unknown>>;
    children?: ReactNode;
    [key: string]: unknown;
  }

  export const Provider: ComponentType<ProviderProps>;
}
