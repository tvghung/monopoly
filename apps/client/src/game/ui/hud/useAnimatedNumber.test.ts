import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { COUNTER_DURATION_MS, useAnimatedNumber, type NumberAnimator } from './useAnimatedNumber';

interface Run {
  from: number;
  to: number;
  options: { duration: number; onUpdate: (value: number) => void; onComplete: () => void };
  stop: Mock<() => void>;
}

const runs: Run[] = [];

const animator: NumberAnimator = (from, to, options) => {
  const run: Run = { from, to, options, stop: vi.fn<() => void>() };
  runs.push(run);
  return { stop: run.stop };
};

interface Props { target: number; reducedMotion: boolean; speed: number; resetEpoch: number }
const base: Props = { target: 1000, reducedMotion: false, speed: 1, resetEpoch: 0 };
const mount = (initial: Props = base) => renderHook(
  (props: Props) => useAnimatedNumber(props.target, props, animator),
  { initialProps: initial },
);

describe('useAnimatedNumber', () => {
  beforeEach(() => { runs.length = 0; });

  it('starts at the target without animating', () => {
    const { result } = mount();
    expect(result.current).toBe(1000);
    expect(runs).toHaveLength(0);
  });

  it('counts from the shown value to the new target over 480 ms and lands exactly on it', () => {
    const { result, rerender } = mount();
    rerender({ ...base, target: 1500 });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ from: 1000, to: 1500 });
    expect(runs[0].options.duration).toBeCloseTo(COUNTER_DURATION_MS / 1000);

    act(() => runs[0].options.onUpdate(1234.6));
    expect(result.current).toBe(1235);
    act(() => runs[0].options.onComplete());
    expect(result.current).toBe(1500);
  });

  it('continues from the value on screen when the target changes mid-count', () => {
    const { result, rerender } = mount();
    rerender({ ...base, target: 2000 });
    act(() => runs[0].options.onUpdate(1400));
    rerender({ ...base, target: 1000 });
    expect(runs[0].stop).toHaveBeenCalled();
    expect(runs[1]).toMatchObject({ from: 1400, to: 1000 });
    expect(result.current).toBe(1400);
  });

  it('divides the duration by the animation speed', () => {
    const { rerender } = mount({ ...base, speed: 2 });
    rerender({ ...base, speed: 2, target: 1200 });
    expect(runs[0].options.duration).toBeCloseTo(COUNTER_DURATION_MS / 1000 / 2);
  });

  it('jumps straight to the target with reduced motion', () => {
    const { result, rerender } = mount({ ...base, reducedMotion: true });
    rerender({ ...base, reducedMotion: true, target: 700 });
    expect(result.current).toBe(700);
    expect(runs).toHaveLength(0);
  });

  it('snaps and stops the running count when the presentation reset epoch changes', () => {
    const { result, rerender } = mount();
    rerender({ ...base, target: 2000 });
    act(() => runs[0].options.onUpdate(1300));
    rerender({ ...base, target: 3000, resetEpoch: 1 });
    expect(runs[0].stop).toHaveBeenCalled();
    expect(result.current).toBe(3000);
    expect(runs).toHaveLength(1);
  });

  it('stops the count on unmount', () => {
    const { rerender, unmount } = mount();
    rerender({ ...base, target: 1500 });
    unmount();
    expect(runs[0].stop).toHaveBeenCalled();
  });
});
