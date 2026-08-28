import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OwnTheBlockDesktopBridge } from './types';
import {
  isRuntimeConfigLoadError,
  loadRuntimeConfig,
} from './runtimeConfig';

afterEach(() => {
  delete window.ownTheBlockDesktop;
});

function bridgeWithResult(result: Awaited<ReturnType<OwnTheBlockDesktopBridge['getRuntimeConfig']>>): OwnTheBlockDesktopBridge {
  return {
    getRuntimeConfig: vi.fn(() => Promise.resolve(result)),
    window: {
      getState: vi.fn(),
      setFullscreen: vi.fn(),
      toggleFullscreen: vi.fn(),
      onFullscreenChanged: vi.fn(() => () => {}),
    },
    quit: {
      onQuitRequested: vi.fn(() => () => {}),
      respond: vi.fn(),
    },
    openExternal: vi.fn(),
  };
}

describe('renderer desktop runtime-config bridge', () => {
  it('converts a structured expected failure into a local typed error', async () => {
    const bridge = bridgeWithResult({
      ok: false,
      code: 'PACKAGED_SOCKET_URL_MISSING',
    });
    window.ownTheBlockDesktop = bridge;

    await expect(loadRuntimeConfig()).rejects.toMatchObject({
      code: 'PACKAGED_SOCKET_URL_MISSING',
    });

    try {
      await loadRuntimeConfig();
    } catch (error) {
      expect(isRuntimeConfigLoadError(error)).toBe(true);
    }
  });

  it('returns the structured success config unchanged', async () => {
    const config = {
      target: 'desktop' as const,
      socketUrl: 'https://play.example.test',
      platform: 'win32' as const,
      appVersion: '1.0.0',
    };
    window.ownTheBlockDesktop = bridgeWithResult({ ok: true, config });

    await expect(loadRuntimeConfig()).resolves.toEqual(config);
  });
});
