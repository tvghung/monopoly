import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SETTINGS_STORAGE_KEY } from '../../../settings/defaults';
import { SETTINGS_SURFACES } from './settingsSurfaces';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderSurface(id: string) {
  const fixture = SETTINGS_SURFACES.find(surface => surface.id === id);
  if (!fixture) throw new Error(`No settings surface ${id}`);
  return render(<>{fixture.render()}</>);
}

describe('settings surfaces', () => {
  it('shows the desktop window section only in the desktop fixture and removes the bridge when it unmounts', () => {
    expect(window.ownTheBlockDesktop).toBeUndefined();

    const plain = renderSurface('settings');
    expect(screen.queryByRole('heading', { name: 'Cửa sổ' })).toBeNull();
    plain.unmount();

    const desktop = renderSurface('settings-desktop');
    expect(screen.getByRole('heading', { name: 'Cửa sổ' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Toàn màn hình' })).toBeTruthy();
    expect(window.ownTheBlockDesktop).toBeDefined();
    desktop.unmount();
    expect(window.ownTheBlockDesktop).toBeUndefined();

    renderSurface('settings');
    expect(screen.queryByRole('heading', { name: 'Cửa sổ' })).toBeNull();
  });

  it('opens the reduced-motion fixture with the switch on and 1.5x selected', () => {
    renderSurface('settings-reduced-motion');
    expect(screen.getByRole('switch', { name: 'Giảm chuyển động' })).toHaveProperty('checked', true);
    expect(screen.getByRole('radio', { name: '1.5x' }).getAttribute('aria-checked')).toBe('true');
  });

  it('puts the saved settings back when a surface closes, so reviewing one never changes them', () => {
    const saved = JSON.stringify({ version: 1, masterVolume: 0.2 });
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, saved);

    const view = renderSurface('settings-reduced-motion');
    expect(window.localStorage.getItem(SETTINGS_STORAGE_KEY)).not.toBe(saved);
    view.unmount();

    expect(window.localStorage.getItem(SETTINGS_STORAGE_KEY)).toBe(saved);
  });
});
