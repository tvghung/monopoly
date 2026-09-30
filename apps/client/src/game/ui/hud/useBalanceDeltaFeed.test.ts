import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BalanceDeltaSignal } from '../../presentation/store/types';
import { DELTA_CHIP_LIFETIME_MS, useBalanceDeltaFeed } from './useBalanceDeltaFeed';

const delta = (id: string, sequence: number, playerId: string, amount: number, consequenceOrder = 0): BalanceDeltaSignal => ({
  id, sequence, consequenceOrder, playerId, from: 1000, to: 1000 + amount, delta: amount, durationMs: 480,
});

interface Props { deltas: readonly BalanceDeltaSignal[]; resetEpoch: number; speed: number }

function mount(initial: Props, playerId = 'player-a') {
  return renderHook(
    (props: Props) => useBalanceDeltaFeed(playerId, props.deltas, { resetEpoch: props.resetEpoch, speed: props.speed }),
    { initialProps: initial },
  );
}

describe('useBalanceDeltaFeed', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('never replays the history that was already in the store when the card mounted', () => {
    const history = [delta('d1', 3, 'player-a', 100_000), delta('d2', 4, 'player-a', -6_000)];
    const { result } = mount({ deltas: history, resetEpoch: 0, speed: 1 });
    expect(result.current).toHaveLength(0);
  });

  it('shows a chip for each new delta of its own player only', () => {
    const history = [delta('d1', 3, 'player-a', 100_000)];
    const { result, rerender } = mount({ deltas: history, resetEpoch: 0, speed: 1 });
    rerender({ deltas: [...history, delta('d2', 5, 'player-a', -6_000), delta('d3', 5, 'player-b', 6_000)], resetEpoch: 0, speed: 1 });
    expect(result.current.map(entry => entry.value.delta)).toEqual([-6_000]);
  });

  it('keeps at most two chips, newest last, and removes each after its lifetime', () => {
    const { result, rerender } = mount({ deltas: [], resetEpoch: 0, speed: 1 });
    rerender({
      deltas: [delta('d1', 1, 'player-a', 10), delta('d2', 2, 'player-a', 20), delta('d3', 3, 'player-a', 30)],
      resetEpoch: 0,
      speed: 1,
    });
    expect(result.current.map(entry => entry.value.delta)).toEqual([20, 30]);
    act(() => { vi.advanceTimersByTime(DELTA_CHIP_LIFETIME_MS + 1); });
    expect(result.current).toHaveLength(0);
  });

  it('orders deltas of one update by consequence order', () => {
    const { result, rerender } = mount({ deltas: [], resetEpoch: 0, speed: 1 });
    rerender({
      deltas: [delta('late', 2, 'player-a', -5, 2), delta('early', 2, 'player-a', 50, 1)],
      resetEpoch: 0,
      speed: 1,
    });
    expect(result.current.map(entry => entry.value.id)).toEqual(['early', 'late']);
  });

  it('divides the chip lifetime by the animation speed', () => {
    const { result, rerender } = mount({ deltas: [], resetEpoch: 0, speed: 2 });
    rerender({ deltas: [delta('d1', 1, 'player-a', 10)], resetEpoch: 0, speed: 2 });
    act(() => { vi.advanceTimersByTime(DELTA_CHIP_LIFETIME_MS / 2 - 50); });
    expect(result.current).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toHaveLength(0);
  });

  it('clears the chips and skips the backlog when the presentation reset epoch changes', () => {
    const { result, rerender } = mount({ deltas: [], resetEpoch: 0, speed: 1 });
    rerender({ deltas: [delta('d1', 1, 'player-a', 10)], resetEpoch: 0, speed: 1 });
    expect(result.current).toHaveLength(1);

    // A session sync bumps the epoch and hands over a backlog: nothing may animate.
    rerender({ deltas: [delta('d1', 1, 'player-a', 10), delta('d2', 2, 'player-a', 20)], resetEpoch: 1, speed: 1 });
    expect(result.current).toHaveLength(0);

    // Live updates after the reset work again.
    rerender({ deltas: [delta('d1', 1, 'player-a', 10), delta('d2', 2, 'player-a', 20), delta('d3', 3, 'player-a', 30)], resetEpoch: 1, speed: 1 });
    expect(result.current.map(entry => entry.value.id)).toEqual(['d3']);
  });

  it('treats a sequence that goes backwards as a store restart and shows nothing for the backlog', () => {
    const { result, rerender } = mount({ deltas: [delta('d9', 9, 'player-a', 10)], resetEpoch: 0, speed: 1 });
    rerender({ deltas: [delta('n1', 1, 'player-a', 20), delta('n2', 2, 'player-a', 30)], resetEpoch: 0, speed: 1 });
    expect(result.current).toHaveLength(0);
    rerender({
      deltas: [delta('n1', 1, 'player-a', 20), delta('n2', 2, 'player-a', 30), delta('n3', 3, 'player-a', 40)],
      resetEpoch: 0,
      speed: 1,
    });
    expect(result.current.map(entry => entry.value.id)).toEqual(['n3']);
  });

  it('does not show the same delta twice when the array is re-created', () => {
    const { result, rerender } = mount({ deltas: [], resetEpoch: 0, speed: 1 });
    const one = delta('d1', 1, 'player-a', 10);
    rerender({ deltas: [one], resetEpoch: 0, speed: 1 });
    rerender({ deltas: [{ ...one }], resetEpoch: 0, speed: 1 });
    expect(result.current).toHaveLength(1);
  });
});
