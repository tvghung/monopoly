import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME_SETTINGS } from './defaults';
import { useSettings } from './selectors';
import { SettingsProvider } from './SettingsProvider';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.reducedMotion;
});

function Toggle({ onReady }: { onReady: (setReduced: (value: boolean) => void) => void }) {
  const { updateSettings } = useSettings();
  onReady(value => updateSettings({ reducedMotion: value }));
  return null;
}

describe('ReducedMotionDocumentSync', () => {
  it('mirrors the in-game setting onto the document element', () => {
    let setReduced: (value: boolean) => void = () => {};
    render(
      <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, reducedMotion: false }}>
        <Toggle onReady={setter => { setReduced = setter; }} />
      </SettingsProvider>,
    );
    expect(document.documentElement.dataset.reducedMotion).toBe('false');

    act(() => setReduced(true));
    expect(document.documentElement.dataset.reducedMotion).toBe('true');

    act(() => setReduced(false));
    expect(document.documentElement.dataset.reducedMotion).toBe('false');
  });

  it('is also true when only the OS asks for reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    render(
      <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, reducedMotion: false }}>
        <span />
      </SettingsProvider>,
    );
    expect(document.documentElement.dataset.reducedMotion).toBe('true');
  });

  it('removes the attribute when the provider unmounts', () => {
    const { unmount } = render(
      <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, reducedMotion: true }}>
        <span />
      </SettingsProvider>,
    );
    expect(document.documentElement.dataset.reducedMotion).toBe('true');
    unmount();
    expect(document.documentElement.dataset.reducedMotion).toBeUndefined();
  });
});
