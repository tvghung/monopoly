import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRetainedValue } from './useRetainedValue';

describe('useRetainedValue', () => {
  it('follows a non-null value and keeps the last one while it is null', () => {
    const { result, rerender } = renderHook(({ value }: { value: number | null }) => useRetainedValue(value), {
      initialProps: { value: null as number | null },
    });
    expect(result.current).toBeNull();

    rerender({ value: 7 });
    expect(result.current).toBe(7);

    rerender({ value: null });
    expect(result.current).toBe(7);

    rerender({ value: 9 });
    expect(result.current).toBe(9);
  });

  it('starts from the initial value', () => {
    const { result } = renderHook(() => useRetainedValue('a'));
    expect(result.current).toBe('a');
  });
});
