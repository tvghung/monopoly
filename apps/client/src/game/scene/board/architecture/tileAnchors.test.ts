import { describe, expect, it } from 'vitest';
import {
  getBuildingAnchor,
  getPlayerLandingAnchor,
  getTileCenterAnchor,
  getTileSurfaceWorldY,
} from './tileAnchors';
import { TILE_SURFACE_Y } from '../boardLayout';

describe('tile anchor contracts', () => {
  it.each([1, 11, 21, 31])('derives one canonical center transform for tile %i', tileId => {
    const anchor = getTileCenterAnchor(tileId);
    expect(anchor?.position.every(Number.isFinite)).toBe(true);
    expect(anchor?.rotation).toHaveLength(3);
    expect(getTileCenterAnchor(tileId)).toEqual(anchor);
  });

  it('keeps player and building anchors deterministic and rotated by the board layout', () => {
    const player = getPlayerLandingAnchor(1, 0);
    const building = getBuildingAnchor(1, 0);
    expect(player).toBeDefined();
    expect(building).toBeDefined();
    expect(player).not.toEqual(building);
    expect(getPlayerLandingAnchor(1, 99)).toBeUndefined();
    expect(getBuildingAnchor(999, 0)).toBeUndefined();
    expect(getTileSurfaceWorldY(1)).toBeCloseTo(TILE_SURFACE_Y);
  });
});
