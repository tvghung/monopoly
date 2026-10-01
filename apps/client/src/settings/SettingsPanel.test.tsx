import {
  cleanup, fireEvent, render, screen, within,
} from '@testing-library/react';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import type { OwnTheBlockDesktopBridge } from '../runtime/types';
import { DEFAULT_GAME_SETTINGS } from './defaults';
import { useSettings } from './selectors';
import SettingsPanel from './SettingsPanel';
import { SettingsProvider } from './SettingsProvider';
import type { GameSettings } from './types';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete window.ownTheBlockDesktop;
});

const REDUCED_HINT = 'Chuyển động hiện đang được giảm theo cài đặt hoặc hệ điều hành.';
const NORMAL_HINT = 'Chuyển động đang dùng thiết lập bình thường.';

function CurrentSettings() {
  const { settings } = useSettings();
  return <output data-testid="settings">{JSON.stringify(settings)}</output>;
}

function currentSettings(): GameSettings {
  return JSON.parse(screen.getByTestId('settings').textContent ?? '{}') as GameSettings;
}

function renderPanel({ settings = {}, onClose = () => {} }: { settings?: Partial<GameSettings>; onClose?: () => void } = {}) {
  return render(
    <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, ...settings }}>
      <SettingsPanel open onClose={onClose} />
      <CurrentSettings />
    </SettingsProvider>,
  );
}

function installDesktopBridge() {
  const setFullscreen = vi.fn(() => Promise.resolve());
  window.ownTheBlockDesktop = {
    getRuntimeConfig: vi.fn(),
    window: {
      getState: vi.fn(() => Promise.resolve({ fullscreen: false, maximized: false, resizable: true })),
      setFullscreen,
      toggleFullscreen: vi.fn(() => Promise.resolve()),
      onFullscreenChanged: vi.fn(() => () => {}),
    },
    quit: { onQuitRequested: vi.fn(() => () => {}), respond: vi.fn() },
    openExternal: vi.fn(async () => {}),
  } satisfies OwnTheBlockDesktopBridge;
  return setFullscreen;
}

describe('SettingsPanel layout', () => {
  it('is the dialog "Cài đặt" with a close button and one heading per section', () => {
    renderPanel();

    const dialog = screen.getByRole('dialog', { name: 'Cài đặt' });
    expect(within(dialog).getByRole('button', { name: 'Đóng' })).toBeTruthy();
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual([
      'Âm thanh', 'Hiển thị', 'Đồ họa',
    ]);
  });

  it('shows every control with its current value and a visible label', () => {
    renderPanel({ settings: { masterVolume: 0.5, musicVolume: 0.25, sfxVolume: 1, animationSpeed: 1.5 } });

    for (const [label, value, readout] of [
      ['Âm lượng tổng', '0.5', '50%'],
      ['Nhạc nền', '0.25', '25%'],
      ['Hiệu ứng', '1', '100%'],
    ] as const) {
      const slider = screen.getByLabelText(label);
      expect(slider).toHaveProperty('type', 'range');
      expect(slider).toHaveProperty('value', value);
      expect(slider.getAttribute('aria-valuetext')).toBe(readout);
      expect(screen.getByText(label).tagName).toBe('LABEL');
      expect(screen.getByText(readout).tagName).toBe('OUTPUT');
    }

    const speed = screen.getByRole('radiogroup', { name: 'Tốc độ chuyển động' });
    expect(within(speed).getAllByRole('radio').map(radio => radio.textContent)).toEqual(['0.75x', '1x', '1.5x', '2x']);
    expect(within(speed).getByRole('radio', { name: '1.5x' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Tốc độ chuyển động')).toBeTruthy();
    expect(screen.getByText('Chất lượng đồ họa')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Giảm chuyển động' })).toHaveProperty('checked', false);
  });

  it('puts "Khôi phục mặc định" and "Xong" in the dialog footer, outside the scrolling body', () => {
    renderPanel();

    const footer = screen.getByRole('dialog', { name: 'Cài đặt' }).querySelector<HTMLElement>('.ds-modal__footer');
    expect(footer).not.toBeNull();
    const buttons = within(footer!).getAllByRole('button');
    expect(buttons.map(button => button.textContent)).toEqual(['Khôi phục mặc định', 'Xong']);
    expect(buttons.every(button => button.closest('.ds-modal__body') === null)).toBe(true);
  });
});

describe('SettingsPanel audio', () => {
  it('stores a slider change and updates its percentage readout', () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText('Nhạc nền'), { target: { value: '0.35' } });
    fireEvent.change(screen.getByLabelText('Hiệu ứng'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Âm lượng tổng'), { target: { value: '0.5' } });

    expect(currentSettings()).toMatchObject({ masterVolume: 0.5, musicVolume: 0.35, sfxVolume: 0 });
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByText('35%')).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
  });
});

describe('SettingsPanel motion', () => {
  it('moves the animation speed with the arrow keys and stores it', () => {
    renderPanel();
    const group = screen.getByRole('radiogroup', { name: 'Tốc độ chuyển động' });

    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(currentSettings().animationSpeed).toBe(1.5);
    expect(screen.getByRole('radio', { name: '1.5x' }).getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '1.5x' }));

    fireEvent.keyDown(group, { key: 'End' });
    expect(currentSettings().animationSpeed).toBe(2);
    fireEvent.keyDown(group, { key: 'Home' });
    expect(currentSettings().animationSpeed).toBe(0.75);
    fireEvent.click(screen.getByRole('radio', { name: '1x' }));
    expect(currentSettings().animationSpeed).toBe(1);
  });

  it('toggles "Giảm chuyển động" and keeps the hint in step with the effective state', () => {
    renderPanel();
    const toggle = screen.getByRole('switch', { name: 'Giảm chuyển động' });
    expect(screen.getByText(NORMAL_HINT)).toBeTruthy();

    fireEvent.click(toggle);
    expect(currentSettings().reducedMotion).toBe(true);
    expect(toggle).toHaveProperty('checked', true);
    expect(screen.getByText(REDUCED_HINT)).toBeTruthy();
    expect(screen.queryByText(NORMAL_HINT)).toBeNull();

    fireEvent.click(toggle);
    expect(currentSettings().reducedMotion).toBe(false);
    expect(screen.getByText(NORMAL_HINT)).toBeTruthy();
  });

  it('opens with the reduced-motion hint when the setting is already on', () => {
    renderPanel({ settings: { reducedMotion: true } });

    expect(screen.getByRole('switch', { name: 'Giảm chuyển động' })).toHaveProperty('checked', true);
    expect(screen.getByText(REDUCED_HINT)).toBeTruthy();
  });

  it('shows the reduced-motion hint when only the operating system asks for it', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    renderPanel();

    expect(screen.getByRole('switch', { name: 'Giảm chuyển động' })).toHaveProperty('checked', false);
    expect(screen.getByText(REDUCED_HINT)).toBeTruthy();
  });
});

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
    expect(currentSettings().graphicsQuality).toBe('low');
    fireEvent.click(screen.getByRole('radio', { name: 'Cao' }));
    expect(currentSettings().graphicsQuality).toBe('high');
  });

  it('moves the preset with the arrow keys', () => {
    renderPanel();
    const group = screen.getByRole('radiogroup', { name: 'Chất lượng đồ họa' });

    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(currentSettings().graphicsQuality).toBe('high');
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(currentSettings().graphicsQuality).toBe('balanced');
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(currentSettings().graphicsQuality).toBe('high');
    expect(screen.getByRole('radio', { name: 'Cao' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('SettingsPanel window section', () => {
  it('is absent outside the desktop shell', () => {
    renderPanel();

    expect(screen.queryByRole('heading', { name: 'Cửa sổ' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Toàn màn hình' })).toBeNull();
  });

  it('offers "Toàn màn hình" in the desktop shell and drives the native window', () => {
    const setFullscreen = installDesktopBridge();
    renderPanel();

    expect(screen.getByRole('heading', { name: 'Cửa sổ' })).toBeTruthy();
    const toggle = screen.getByRole('switch', { name: 'Toàn màn hình' });
    setFullscreen.mockClear();

    fireEvent.click(toggle);
    expect(currentSettings().fullscreen).toBe(true);
    expect(toggle).toHaveProperty('checked', true);
    expect(setFullscreen).toHaveBeenLastCalledWith(true);

    fireEvent.click(toggle);
    expect(currentSettings().fullscreen).toBe(false);
    expect(setFullscreen).toHaveBeenLastCalledWith(false);
  });
});

describe('SettingsPanel reset and closing', () => {
  it('restores every default with "Khôi phục mặc định"', () => {
    renderPanel({
      settings: {
        masterVolume: 0.1, musicVolume: 0.2, sfxVolume: 0.3, animationSpeed: 2, reducedMotion: true, graphicsQuality: 'low',
      },
    });
    expect(currentSettings()).not.toEqual(DEFAULT_GAME_SETTINGS);

    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục mặc định' }));

    expect(currentSettings()).toEqual(DEFAULT_GAME_SETTINGS);
    expect(screen.getByLabelText('Âm lượng tổng')).toHaveProperty('value', '1');
    expect(screen.getByRole('radio', { name: '1x' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Tự động' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('switch', { name: 'Giảm chuyển động' })).toHaveProperty('checked', false);
  });

  it('also leaves the native window fullscreen when resetting in the desktop shell', () => {
    const setFullscreen = installDesktopBridge();
    renderPanel({ settings: { fullscreen: true } });
    setFullscreen.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục mặc định' }));

    expect(currentSettings().fullscreen).toBe(false);
    expect(setFullscreen).toHaveBeenCalledWith(false);
  });

  it('closes with "Xong", with the X and with Escape', () => {
    const onClose = vi.fn();
    renderPanel({ onClose });

    fireEvent.click(screen.getByRole('button', { name: 'Xong' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
