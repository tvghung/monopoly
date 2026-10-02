import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VictoryConfetti, { CONFETTI_DURATION_MS, CONFETTI_PIECE_COUNT } from './VictoryConfetti';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const pieces = () => [...document.querySelectorAll<HTMLElement>('.victory-confetti__piece')];
const milliseconds = (value: string) => Number.parseFloat(value);

describe('VictoryConfetti', () => {
  it('renders one aria-hidden burst of at most 60 pieces', () => {
    render(<VictoryConfetti />);
    const burst = document.querySelector('.victory-confetti');
    expect(burst?.getAttribute('aria-hidden')).toBe('true');
    expect(pieces()).toHaveLength(CONFETTI_PIECE_COUNT);
    expect(CONFETTI_PIECE_COUNT).toBeLessThanOrEqual(60);
  });

  it('uses the lacquer, gold, jade and paper colors', () => {
    render(<VictoryConfetti />);
    expect(new Set(pieces().map(piece => piece.dataset.color))).toEqual(new Set(['lacquer', 'gold', 'jade', 'paper']));
  });

  it('ends every piece within 1200 ms', () => {
    render(<VictoryConfetti />);
    expect(CONFETTI_DURATION_MS).toBeLessThanOrEqual(1200);
    pieces().forEach(piece => {
      const end = milliseconds(piece.style.animationDelay) + milliseconds(piece.style.animationDuration);
      expect(end).toBeGreaterThan(0);
      expect(end).toBeLessThanOrEqual(CONFETTI_DURATION_MS);
    });
  });

  it('looks the same on every render', () => {
    const first = render(<VictoryConfetti />);
    const before = pieces().map(piece => piece.getAttribute('style'));
    first.unmount();
    render(<VictoryConfetti />);
    expect(pieces().map(piece => piece.getAttribute('style'))).toEqual(before);
  });

  it('removes itself when the burst is over, and not before', () => {
    vi.useFakeTimers();
    render(<VictoryConfetti />);
    act(() => { vi.advanceTimersByTime(CONFETTI_DURATION_MS - 1); });
    expect(pieces()).toHaveLength(CONFETTI_PIECE_COUNT);
    act(() => { vi.advanceTimersByTime(1); });
    expect(document.querySelector('.victory-confetti')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer when it unmounts early', () => {
    vi.useFakeTimers();
    const view = render(<VictoryConfetti />);
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(document.querySelector('.victory-confetti')).toBeNull();
  });
});
