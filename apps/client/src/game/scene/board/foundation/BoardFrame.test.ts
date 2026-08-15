import { describe, expect, it } from 'vitest';
import {
  BOARD_FRAME_HEIGHT,
  BOARD_FRAME_WIDTH,
  PROPERTY_NAME_Y,
} from '../architecture/boardArtSpec';
import { getBoardFrameSegments } from './BoardFrame';

describe('recessed board center frame', () => {
  it('uses four symmetric, narrow rails below the tile text plane', () => {
    const segments = getBoardFrameSegments();
    const [bottom, top, left, right] = segments;

    expect(segments).toHaveLength(4);
    expect(BOARD_FRAME_HEIGHT).toBeGreaterThanOrEqual(0.05);
    expect(BOARD_FRAME_HEIGHT).toBeLessThanOrEqual(0.08);
    expect(BOARD_FRAME_WIDTH).toBeGreaterThanOrEqual(0.1);
    expect(BOARD_FRAME_WIDTH).toBeLessThanOrEqual(0.14);
    expect(bottom.position[2]).toBeCloseTo(-top.position[2]);
    expect(left.position[0]).toBeCloseTo(-right.position[0]);
    expect(bottom.width).toBe(top.width);
    expect(left.depth).toBe(right.depth);
    segments.forEach(segment => {
      expect(segment.position[1] + BOARD_FRAME_HEIGHT / 2).toBeLessThan(PROPERTY_NAME_Y);
    });
  });
});
