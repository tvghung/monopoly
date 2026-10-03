import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffectiveReducedMotion, useSettingsAvailable } from './selectors';
import { SettingsProvider } from './SettingsProvider';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })));
}

describe('useSettingsAvailable', () => {
  it('is false with no provider above, so a screen can leave its settings button out', () => {
    expect(renderHook(() => useSettingsAvailable()).result.current).toBe(false);
  });

  it('is true inside the settings provider', () => {
    const view = renderHook(() => useSettingsAvailable(), { wrapper: SettingsProvider });
    expect(view.result.current).toBe(true);
  });
});

describe('useEffectiveReducedMotion', () => {
  it('knows an OS-level reduced-motion preference at the very first render', () => {
    stubMatchMedia(true);
    const seen: boolean[] = [];
    renderHook(() => {
      const value = useEffectiveReducedMotion();
      seen.push(value);
      return value;
    });
    // Never false first: a dialog mounting under the preference must not start its normal entrance.
    expect(seen[0]).toBe(true);
    expect(seen.every(Boolean)).toBe(true);
  });

  it('is false when the OS does not ask for reduced motion', () => {
    stubMatchMedia(false);
    expect(renderHook(() => useEffectiveReducedMotion()).result.current).toBe(false);
  });

  it('is false where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => useEffectiveReducedMotion()).result.current).toBe(false);
  });
});
