import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_GAME_SETTINGS } from './defaults';
import { useSettings } from './selectors';
import { SettingsProvider } from './SettingsProvider';
import type { GraphicsQualitySetting } from './types';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.graphicsQuality;
});

function Toggle({ onReady }: { onReady: (set: (value: GraphicsQualitySetting) => void) => void }) {
  const { updateSettings } = useSettings();
  onReady(value => updateSettings({ graphicsQuality: value }));
  return null;
}

describe('GraphicsQualityDocumentSync', () => {
  it('mirrors an explicit tier onto the document element and follows changes', () => {
    let setQuality: (value: GraphicsQualitySetting) => void = () => {};
    render(
      <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, graphicsQuality: 'high' }}>
        <Toggle onReady={setter => { setQuality = setter; }} />
      </SettingsProvider>,
    );
    expect(document.documentElement.dataset.graphicsQuality).toBe('high');

    act(() => setQuality('low'));
    expect(document.documentElement.dataset.graphicsQuality).toBe('low');
    act(() => setQuality('balanced'));
    expect(document.documentElement.dataset.graphicsQuality).toBe('balanced');
  });

  it('resolves auto to a concrete tier (never auto, never high) and cleans up on unmount', () => {
    const { unmount } = render(
      <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, graphicsQuality: 'auto' }}>
        <span />
      </SettingsProvider>,
    );

    expect(['low', 'balanced']).toContain(document.documentElement.dataset.graphicsQuality);
    unmount();
    expect(document.documentElement.dataset.graphicsQuality).toBeUndefined();
  });
});
