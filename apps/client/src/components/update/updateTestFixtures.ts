import { act } from '@testing-library/react';
import { vi } from 'vitest';
import type { AppUpdateState, OwnTheBlockDesktopBridge } from '../../runtime/types';

/** Test doubles for the update screens: states as the main process publishes them, and a bridge that records the calls. */
export function updateState(overrides: Partial<AppUpdateState> = {}): AppUpdateState {
  return { phase: 'idle', currentVersion: '1.1.1', installMode: 'restart', ...overrides };
}

export const OFFER = { version: '1.2.0', mandatory: false, sizeBytes: 168_398_848 } as const;
export const REQUIRED = { ...OFFER, mandatory: true } as const;

export const available = (overrides: Partial<AppUpdateState> = {}): AppUpdateState => updateState({
  phase: 'available', update: OFFER, ...overrides,
});
export const requiredAvailable = (overrides: Partial<AppUpdateState> = {}): AppUpdateState => updateState({
  phase: 'available', update: REQUIRED, ...overrides,
});
export const downloading = (receivedBytes: number, overrides: Partial<AppUpdateState> = {}): AppUpdateState => updateState({
  phase: 'downloading', update: OFFER, progress: { receivedBytes, totalBytes: OFFER.sizeBytes }, ...overrides,
});
export const ready = (overrides: Partial<AppUpdateState> = {}): AppUpdateState => updateState({
  phase: 'ready', update: OFFER, ...overrides,
});

export function installUpdateBridge(initial: AppUpdateState, extra: Partial<OwnTheBlockDesktopBridge> = {}) {
  let listener: ((state: AppUpdateState) => void) | undefined;
  const exitApp = vi.fn(() => Promise.resolve());
  const update = {
    getState: vi.fn(() => Promise.resolve(initial)),
    check: vi.fn(() => Promise.resolve(initial)),
    download: vi.fn(() => Promise.resolve(initial)),
    cancelDownload: vi.fn(() => Promise.resolve(initial)),
    install: vi.fn(() => Promise.resolve(initial)),
    onStateChanged: vi.fn((next: (state: AppUpdateState) => void) => {
      listener = next;
      return () => { listener = undefined; };
    }),
  };
  window.ownTheBlockDesktop = {
    getRuntimeConfig: vi.fn(),
    window: {
      getState: vi.fn(() => Promise.resolve({ fullscreen: false, maximized: false, resizable: true })),
      setFullscreen: vi.fn(() => Promise.resolve()),
      toggleFullscreen: vi.fn(() => Promise.resolve()),
      onFullscreenChanged: vi.fn(() => () => undefined),
    },
    quit: { onQuitRequested: vi.fn(() => () => undefined), respond: vi.fn(), exitApp },
    openExternal: vi.fn(() => Promise.resolve()),
    update,
    ...extra,
  };
  return {
    update,
    /** The "Thoát" call of the quit group. */
    exitApp,
    /** The main process publishes a new state (the render and its effects are flushed when this returns). */
    push: (state: AppUpdateState): Promise<void> => {
      act(() => { listener?.(state); });
      return Promise.resolve();
    },
  };
}
