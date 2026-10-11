import { describe, expect, it } from 'vitest';
import { getAnimationElapsedMs } from './animationTime';

describe('getAnimationElapsedMs', () => {
  it('measures from the effect start after a long demand-rendering idle gap', () => {
    const startedAtMs = 3_000;

    expect(getAnimationElapsedMs(startedAtMs, 3_016)).toBe(16);
    expect(getAnimationElapsedMs(startedAtMs, 3_500)).toBe(500);
  });

  it('does not report negative progress before the start time', () => {
    expect(getAnimationElapsedMs(3_000, 2_999)).toBe(0);
  });
});
