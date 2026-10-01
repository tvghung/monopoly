import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import type { ComponentProps } from 'react';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import { DEFAULT_GAME_SETTINGS } from '../../settings/defaults';
import { SettingsProvider } from '../../settings/SettingsProvider';
import MascotPicker from './MascotPicker';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function makeProps(): ComponentProps<typeof MascotPicker> {
  return {
    selectedCharacterId: 'dog',
    playerColor: 'red',
    takenAppearanceKeys: new Set<string>(),
    busy: false,
    onSetAppearance: vi.fn(),
  };
}

function renderPicker(overrides: Partial<ComponentProps<typeof MascotPicker>> = {}, reducedMotion = false) {
  const props = { ...makeProps(), ...overrides };
  render(
    <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, reducedMotion }}>
      <MascotPicker {...props} />
    </SettingsProvider>,
  );
  return props;
}

function stubSystemReducedMotion(reduced: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
}

describe('MascotPicker reduced motion', () => {
  it('slides the viewed mascot in while motion is allowed', () => {
    renderPicker();
    const hero = screen.getByAltText('Chó');
    expect(hero.style.opacity).toBe('0');
  });

  it('shows the viewed mascot at once when the game setting asks for reduced motion', () => {
    renderPicker({}, true);
    const hero = screen.getByAltText('Chó');
    expect(hero.style.opacity).toBe('1');
    expect(hero.style.transform).toBe('none');
  });

  it('follows the operating-system preference even when the game setting is off', () => {
    stubSystemReducedMotion(true);
    renderPicker();
    expect(screen.getByAltText('Chó').style.opacity).toBe('1');
  });
});

describe('MascotPicker controls', () => {
  it('moves to the neighbouring mascot with the arrows and wraps around', () => {
    const props = renderPicker({ selectedCharacterId: 'dog' });
    fireEvent.click(screen.getByRole('button', { name: 'Mascot tiếp theo' }));
    expect(props.onSetAppearance).toHaveBeenLastCalledWith({ characterId: 'capybara' });

    cleanup();
    const wrapped = renderPicker({ selectedCharacterId: 'dog' });
    fireEvent.click(screen.getByRole('button', { name: 'Mascot trước' }));
    expect(wrapped.onSetAppearance).toHaveBeenLastCalledWith({ characterId: 'duck' });
  });

  it('describes the viewed mascot to assistive technology only', () => {
    renderPicker();
    const stage = screen.getByRole('group', { name: /Mascot đang xem: Chó/u });
    expect(stage.getAttribute('tabindex')).toBe('0');
    expect(screen.queryByText('Chó')).toBeNull();
  });

  it('keeps a color a neighbour already wears with this mascot off limits, and says who has it', () => {
    renderPicker({ takenAppearanceKeys: new Set(['dog:blue']) });
    const taken = screen.getByRole<HTMLButtonElement>('button', { name: 'Xanh dương (đã dùng với Chó)' });
    expect(taken.disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Xanh lá' }).disabled).toBe(false);
  });

  it('marks the chosen mascot and color as pressed and leaves the rest unpressed', () => {
    renderPicker({ selectedCharacterId: 'panda', playerColor: 'green' });
    expect(screen.getByRole('button', { name: 'Gấu trúc' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Chó' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Xanh lá' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Đỏ' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('turns every control off while a request is in flight', () => {
    renderPicker({ busy: true });
    const section = screen.getByLabelText('Chọn nhân vật của bạn');
    const buttons = [...section.querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThan(18);
    expect(buttons.every(button => button.disabled)).toBe(true);
  });
});
