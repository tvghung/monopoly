import { describe, expect, it } from 'vitest';
import {
  MATCH_TIMER_PLACEHOLDER,
  formatElapsedMatchTime,
  formatElapsedMatchTimeFromTimestamp,
  getMatchTimerFaceRotationY,
} from './MatchTimerSign';

describe('authoritative match timer presentation', () => {
  it.each([
    [0, '00:00'],
    [7_000, '00:07'],
    [9 * 60_000 + 42_000, '09:42'],
    [58 * 60_000 + 42_000, '58:42'],
    [60 * 60_000 + 3 * 60_000 + 17_000, '01:03:17'],
    [12 * 60 * 60_000 + 45 * 60_000 + 9_000, '12:45:09'],
  ])('formats %i ms as %s', (elapsed, expected) => {
    expect(formatElapsedMatchTime(elapsed)).toBe(expected);
  });

  it('keeps an old in-progress room on a safe placeholder without a timestamp', () => {
    expect(formatElapsedMatchTimeFromTimestamp(null, Date.now())).toBe(MATCH_TIMER_PLACEHOLDER);
    expect(formatElapsedMatchTimeFromTimestamp('not-a-timestamp', Date.now())).toBe(MATCH_TIMER_PLACEHOLDER);
  });

  it('derives elapsed time from the authoritative timestamp', () => {
    expect(formatElapsedMatchTimeFromTimestamp(
      '2030-01-01T00:00:00.000Z',
      Date.parse('2030-01-01T00:09:42.000Z'),
    )).toBe('09:42');
  });

  it('faces the fixed gameplay camera from a canonical yaw', () => {
    expect(getMatchTimerFaceRotationY([1, 32, 1])).toBeCloseTo(Math.PI / 4);
  });
});
