import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTER_IDS } from '@monopoly/shared';
import { CHARACTER_REGISTRY } from '../../game/characters/characterRegistry';
import { DEFAULT_GAME_SETTINGS } from '../../settings/defaults';
import { SettingsProvider } from '../../settings/SettingsProvider';
import LoadingScreen, { type LoadingStage } from './LoadingScreen';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const STAGE_TEXT: Record<LoadingStage, string> = {
  'loading-settings': 'Đang tải cài đặt…',
  'loading-runtime-config': 'Đang chuẩn bị kết nối…',
  'loading-assets': 'Đang tải tài nguyên…',
  'initializing-client': 'Đang khởi tạo ván chơi…',
  restoring: 'Đang khôi phục ván chơi…',
};

describe('LoadingScreen', () => {
  it.each(Object.entries(STAGE_TEXT))('says what the %s stage is doing', (stage, text) => {
    render(<LoadingScreen stage={stage as LoadingStage} />);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe(text);
    expect(status.getAttribute('aria-live')).toBe('polite');
  });

  it('is the whole page during bootstrap and a section inside the app shell, which has its own main landmark', () => {
    const { container, rerender } = render(<LoadingScreen stage="loading-assets" />);
    expect(container.querySelector('main.app-screen--loading')).not.toBeNull();

    rerender(<LoadingScreen as="section" stage="restoring" />);
    expect(container.querySelector('main')).toBeNull();
    expect(container.querySelector('section.app-screen--loading')).not.toBeNull();
  });

  it('shows the brand lockup with the product name as real text and the tagline as decoration', () => {
    render(<LoadingScreen stage="loading-assets" />);
    expect(screen.getByText('Cờ Tỷ Phú Việt Nam')).toBeTruthy();
    expect(screen.getByText('OWN THE BLOCK').getAttribute('aria-hidden')).toBe('true');
  });

  it('decorates with all eight mascots, hidden from assistive technology and never named', () => {
    const { container } = render(<LoadingScreen stage="loading-assets" />);
    const row = container.querySelector('.app-screen__mascots');
    expect(row?.getAttribute('aria-hidden')).toBe('true');
    const images = [...(row?.querySelectorAll('img') ?? [])];
    expect(images).toHaveLength(8);
    expect(images.every(image => image.getAttribute('alt') === '' && !image.hasAttribute('title'))).toBe(true);
    for (const id of CHARACTER_IDS) {
      expect(screen.queryByText(CHARACTER_REGISTRY[id].accessibleLabel)).toBeNull();
    }
  });

  it('draws three decorative progress dots that the status text does not depend on', () => {
    const { container } = render(<LoadingScreen stage="loading-assets" />);
    const dots = container.querySelector('.app-screen__dots');
    expect(dots?.getAttribute('aria-hidden')).toBe('true');
    expect(dots?.children).toHaveLength(3);
  });

  it('animates by default', () => {
    const { container } = render(
      <SettingsProvider initialSettings={DEFAULT_GAME_SETTINGS}>
        <LoadingScreen stage="loading-assets" />
      </SettingsProvider>,
    );
    expect(container.querySelector('.app-screen--still')).toBeNull();
  });

  it('holds still when the game setting asks for reduced motion', () => {
    const { container } = render(
      <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, reducedMotion: true }}>
        <LoadingScreen stage="restoring" />
      </SettingsProvider>,
    );
    expect(container.querySelector('.app-screen--loading.app-screen--still')).not.toBeNull();
  });

  it('holds still under the operating-system preference, before any settings provider exists', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    const { container } = render(<LoadingScreen stage="loading-settings" />);
    expect(container.querySelector('.app-screen--still')).not.toBeNull();
  });
});
