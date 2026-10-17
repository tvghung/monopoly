import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useSettings, useSettingsSelector, useEffectiveReducedMotion } from './selectors';
import type { GameSettings } from './types';
import { SettingsProvider } from './SettingsProvider';

afterEach(() => {
  cleanup();
  // The provider persists every change; the next test must start from the defaults.
  window.localStorage.clear();
});

const selectReducedMotion = (settings: GameSettings): boolean => settings.reducedMotion;
const selectFpsLimit = (settings: GameSettings): number => settings.fpsLimit;

let renders = { reducedMotion: 0, fps: 0, effective: 0, whole: 0 };
let update: ReturnType<typeof useSettings>['updateSettings'] = () => {};

function ReducedMotionReader() {
  renders.reducedMotion += 1;
  return <output data-testid="reduced">{String(useSettingsSelector(selectReducedMotion))}</output>;
}
function FpsReader() {
  renders.fps += 1;
  return <output data-testid="fps">{useSettingsSelector(selectFpsLimit)}</output>;
}
function EffectiveReader() {
  renders.effective += 1;
  return <output data-testid="effective">{String(useEffectiveReducedMotion())}</output>;
}
function WholeReader() {
  renders.whole += 1;
  const { settings, updateSettings } = useSettings();
  update = updateSettings;
  return <output data-testid="volume">{settings.masterVolume}</output>;
}

function mount() {
  renders = { reducedMotion: 0, fps: 0, effective: 0, whole: 0 };
  return render(
    <SettingsProvider>
      <ReducedMotionReader />
      <FpsReader />
      <EffectiveReader />
      <WholeReader />
    </SettingsProvider>,
  );
}

describe('useSettingsSelector', () => {
  it('re-renders a reader only when the value it selects changes', () => {
    mount();
    const initial = { ...renders };
    act(() => update({ masterVolume: 0.3 }));
    act(() => update({ masterVolume: 0.6 }));
    act(() => update({ muted: true }));
    expect(screen.getByTestId('volume').textContent).toBe('0.6');
    // The reader of the whole settings re-rendered for each change; the selector readers did not.
    expect(renders.whole).toBeGreaterThan(initial.whole);
    expect(renders.reducedMotion).toBe(initial.reducedMotion);
    expect(renders.fps).toBe(initial.fps);
    expect(renders.effective).toBe(initial.effective);
  });

  it('does follow a change of the value it selects', () => {
    mount();
    act(() => update({ reducedMotion: true }));
    expect(screen.getByTestId('reduced').textContent).toBe('true');
    expect(screen.getByTestId('effective').textContent).toBe('true');
    act(() => update({ fpsLimit: 120 }));
    expect(screen.getByTestId('fps').textContent).toBe('120');
  });

  it('is not notified by an update that changes nothing', () => {
    mount();
    const before = { ...renders };
    act(() => update({ reducedMotion: false }));
    expect(renders).toEqual(before);
  });

  it('reads the defaults without a provider', () => {
    renders = { reducedMotion: 0, fps: 0, effective: 0, whole: 0 };
    render(<FpsReader />);
    expect(screen.getByTestId('fps').textContent).toBe('60');
  });
});
