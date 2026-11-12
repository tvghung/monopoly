import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  act, cleanup, fireEvent, render,
} from '@testing-library/react';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import JoinHero, { HERO_REACTION_MS } from './JoinHero';
import { MASCOT_SPARKLE_COUNT } from './mascot/MascotSparkles';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function readCss(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
}

/** Every animation and every pointer-driven transform of a decoration stylesheet sits behind the reduced-motion guard. */
function expectMotionBehindGuard(css: string): void {
  const guardStart = css.indexOf('@media (prefers-reduced-motion: no-preference)');
  expect(guardStart).toBeGreaterThan(0);
  expect(css.slice(guardStart)).toContain(":root:not([data-reduced-motion='true'])");
  expect(css.slice(0, guardStart)).not.toMatch(/animation:/u);
  expect(css).not.toMatch(/\binfinite\b/u);
}

describe('JoinHero interactions', () => {
  it('has no hover effect and does not follow the pointer (only a tap moves a mascot)', () => {
    const css = readCss('./style/JoinHero.css');
    expect(css).not.toMatch(/:hover/u);
    expect(css).not.toMatch(/--hero-look/u);
    const { container } = render(<JoinHero />);
    fireEvent.pointerMove(window, { clientX: 10, clientY: 10 });
    expect(container.querySelector<HTMLElement>('.join-hero')?.getAttribute('style')).toBeNull();
  });

  it('makes a tapped mascot jump once and throw a burst that is pure decoration, then clears it', () => {
    vi.useFakeTimers();
    const { container } = render(<JoinHero />);
    const figures = container.querySelectorAll<HTMLElement>('.join-hero__figure');
    expect(figures).toHaveLength(8);

    fireEvent.pointerDown(figures[2]);
    expect(figures[2].dataset.reaction).toMatch(/^[ab]$/u);
    const burst = figures[2].querySelector('.mascot-sparkles');
    expect(burst?.getAttribute('aria-hidden')).toBe('true');
    expect(burst?.querySelectorAll('.mascot-sparkles__item')).toHaveLength(MASCOT_SPARKLE_COUNT);
    // Still decoration: no text, no control, nothing focusable.
    expect(container.textContent).toBe('');
    expect(container.querySelectorAll('button, a, input, [tabindex], [title]')).toHaveLength(0);

    // A second tap restarts the jump by switching the animation name, without remounting the image.
    const image = figures[2].querySelector('img');
    const first = figures[2].dataset.reaction;
    fireEvent.pointerDown(figures[2]);
    expect(figures[2].dataset.reaction).not.toBe(first);
    expect(figures[2].querySelector('img')).toBe(image);
    expect(figures[2].querySelectorAll('.mascot-sparkles')).toHaveLength(1);

    act(() => { vi.advanceTimersByTime(HERO_REACTION_MS); });
    expect(figures[2].dataset.reaction).toBeUndefined();
    expect(figures[2].querySelector('.mascot-sparkles')).toBeNull();
  });

  it('ignores a secondary-button press', () => {
    const { container } = render(<JoinHero />);
    const figure = container.querySelector<HTMLElement>('.join-hero__figure');
    // jsdom has no PointerEvent; a MouseEvent named pointerdown carries the button to React's handler.
    act(() => { figure!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 2 })); });
    expect(figure?.dataset.reaction).toBeUndefined();
  });

  it('keeps every movement of the hero and of the sparkles behind the reduced-motion guard', () => {
    expectMotionBehindGuard(readCss('./style/JoinHero.css'));
    expectMotionBehindGuard(readCss('./mascot/MascotSparkles.css'));
    // The sparkles are not drawn at all unless motion is allowed.
    expect(readCss('./mascot/MascotSparkles.css')).toMatch(/\.mascot-sparkles \{[^}]*display: none/u);
  });
});
