import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_GAME_SETTINGS } from './defaults';
import { useSettings } from './selectors';
import SettingsPanel from './SettingsPanel';
import { SettingsProvider } from './SettingsProvider';

afterEach(cleanup);

function CurrentQuality() {
  const { settings } = useSettings();
  return <output data-testid="quality">{settings.graphicsQuality}</output>;
}

function renderPanel() {
  return render(
    <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS }}>
      <SettingsPanel open onClose={() => {}} />
      <CurrentQuality />
    </SettingsProvider>,
  );
}

describe('SettingsPanel graphics quality', () => {
  it('offers the four presets under the accessible name "Chất lượng đồ họa" with a hint', () => {
    renderPanel();

    expect(screen.getByRole('heading', { name: 'Đồ họa' })).toBeTruthy();
    const group = screen.getByRole('radiogroup', { name: 'Chất lượng đồ họa' });
    expect([...group.querySelectorAll('[role="radio"]')].map(radio => radio.textContent)).toEqual([
      'Tự động', 'Cao', 'Cân bằng', 'Thấp',
    ]);
    expect(screen.getByRole('radio', { name: 'Tự động' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Chất lượng Cao cần card đồ họa mạnh.')).toBeTruthy();
  });

  it('stores the chosen preset in the settings', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('radio', { name: 'Thấp' }));
    expect(screen.getByTestId('quality').textContent).toBe('low');
    fireEvent.click(screen.getByRole('radio', { name: 'Cao' }));
    expect(screen.getByTestId('quality').textContent).toBe('high');
  });
});
