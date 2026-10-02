import { describe, expect, it } from 'vitest';
import { boardVisualTokens } from '../boardVisualTokens';
import {
  createOuterBoardAccentGeometry,
  createOuterBoardAccentShape,
  getOuterBoardAccentBounds,
  OUTER_BOARD_ACCENT_BAND_WIDTH,
  OUTER_BOARD_ACCENT_HEIGHT,
} from './outerBoardAccent';

describe('continuous outer board accent loop', () => {
  it('uses one closed rounded ring with one hole and a uniform band', () => {
    const bounds = getOuterBoardAccentBounds();
    const shape = createOuterBoardAccentShape(bounds);
    const geometry = createOuterBoardAccentGeometry();

    expect(shape.holes).toHaveLength(1);
    expect(shape.curves).toHaveLength(8);
    expect(shape.holes[0].curves).toHaveLength(8);
    expect(bounds.outerSize - bounds.innerSize).toBeCloseTo(OUTER_BOARD_ACCENT_BAND_WIDTH * 2);
    expect(bounds.outerRadius - bounds.innerRadius).toBeCloseTo(OUTER_BOARD_ACCENT_BAND_WIDTH);
    expect(OUTER_BOARD_ACCENT_HEIGHT).toBeGreaterThan(0);
    expect(geometry.getAttribute('position').count).toBeGreaterThan(0);

    geometry.dispose();
  });

  it('uses a near-white paper-toned accent token instead of the old teal accent', () => {
    // Plan 02 T02.16: the cool #e7ebea became warm paper (#f3e9da); still near white, still not the gold accent.
    expect(boardVisualTokens.boardOuterAccent).toMatch(/^#f[0-9a-f]{5}$/i);
    expect(boardVisualTokens.boardOuterAccent).not.toBe(boardVisualTokens.boardAccent);
  });
});
