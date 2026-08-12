import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import useSteppedPositions from './useSteppedPositions';

describe('useSteppedPositions', () => {
  it('snaps immediately to authoritative positions for reduced motion', () => {
    const { result, rerender } = renderHook(
      ({ actual, reduced }: { actual: Record<string, number>; reduced: boolean }) => (
        useSteppedPositions(actual, reduced)
      ),
      { initialProps: { actual: { player: 0 }, reduced: true } },
    );

    rerender({ actual: { player: 7 }, reduced: true });
    expect(result.current.player).toBe(7);
  });
});
