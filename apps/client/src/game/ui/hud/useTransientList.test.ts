import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTransientList } from './useTransientList';

describe('useTransientList', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('drops each entry when its own lifetime is over, using one timer at a time', () => {
    const { result } = renderHook(() => useTransientList<string>(5));
    act(() => {
      result.current.push('a', 'first', 1000);
      result.current.push('b', 'second', 2500);
    });
    expect(result.current.entries.map(entry => entry.value)).toEqual(['first', 'second']);
    expect(vi.getTimerCount()).toBe(1);

    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.entries.map(entry => entry.value)).toEqual(['second']);
    expect(vi.getTimerCount()).toBe(1);

    act(() => { vi.advanceTimersByTime(1500); });
    expect(result.current.entries).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps only the newest entries when the cap is exceeded', () => {
    const { result } = renderHook(() => useTransientList<number>(2));
    act(() => {
      result.current.push('1', 1, 5000);
      result.current.push('2', 2, 5000);
      result.current.push('3', 3, 5000);
    });
    expect(result.current.entries.map(entry => entry.value)).toEqual([2, 3]);
  });

  it('replaces an entry with the same key and restarts its lifetime', () => {
    const { result } = renderHook(() => useTransientList<string>(3));
    act(() => { result.current.push('banner', 'Lượt của Lan', 1000); });
    act(() => { vi.advanceTimersByTime(800); });
    act(() => { result.current.push('banner', 'Đến lượt bạn!', 1000); });
    expect(result.current.entries.map(entry => entry.value)).toEqual(['Đến lượt bạn!']);
    act(() => { vi.advanceTimersByTime(800); });
    expect(result.current.entries).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current.entries).toHaveLength(0);
  });

  it('clears everything at once and leaves no timer behind', () => {
    const { result } = renderHook(() => useTransientList<string>(3));
    act(() => { result.current.push('a', 'x', 5000); });
    act(() => { result.current.clear(); });
    expect(result.current.entries).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels its timer on unmount', () => {
    const { result, unmount } = renderHook(() => useTransientList<string>(3));
    act(() => { result.current.push('a', 'x', 5000); });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
