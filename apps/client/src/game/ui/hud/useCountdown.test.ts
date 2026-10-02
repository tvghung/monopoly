import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCountdown, useCountdownSeconds } from './useCountdown';

describe('formatCountdown', () => {
  it('formats seconds as m:ss and rounds up so 0:00 only shows at the deadline', () => {
    expect(formatCountdown(125)).toBe('2:05');
    expect(formatCountdown(59.2)).toBe('1:00');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-4)).toBe('0:00');
  });
});

describe('useCountdownSeconds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T10:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('returns null and runs no timer without a deadline', () => {
    const { result } = renderHook(() => useCountdownSeconds(null));
    expect(result.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('counts down once per second and stops at zero', () => {
    const { result } = renderHook(() => useCountdownSeconds('2026-09-30T10:00:03.000Z'));
    expect(result.current).toBeCloseTo(3);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBeCloseTo(2);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBe(0);
  });

  it('clears its interval on unmount', () => {
    const { unmount } = renderHook(() => useCountdownSeconds('2026-09-30T10:01:00.000Z'));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores an unparseable deadline', () => {
    const { result } = renderHook(() => useCountdownSeconds('not-a-date'));
    expect(result.current).toBeNull();
  });
});
