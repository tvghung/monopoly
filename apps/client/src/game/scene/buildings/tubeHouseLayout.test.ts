import { colorGroups } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import { getBoardTileLayout } from '../board/boardLayout';
import { getOrientedTilePanelLayoutForTileSize } from '../board/tiles/tilePanelLayout';
import { TUBE_HOUSE } from './tubeHouseGeometry';
import {
  MAX_TUBE_HOUSES,
  TUBE_HOUSE_BASE_Y,
  getTubeHouseLocalPosition,
  getTubeHouseRowLocalZ,
  getTubeHouseRowOffsets,
  getTubeHouseWorldPlacement,
} from './tubeHouseLayout';

const STREETS = Object.values(colorGroups).flat();

describe('tube house layout', () => {
  it('centers a row of one to four houses with the specified gap', () => {
    const pitch = TUBE_HOUSE.width + TUBE_HOUSE.gap;
    expect(getTubeHouseRowOffsets(1)).toEqual([0]);
    expect(getTubeHouseRowOffsets(2)).toEqual([-pitch / 2, pitch / 2]);
    const four = getTubeHouseRowOffsets(4);
    expect(four).toHaveLength(4);
    expect(four[1] - four[0]).toBeCloseTo(pitch);
    expect(four[0] + four[3]).toBeCloseTo(0);
    expect(getTubeHouseRowOffsets(0)).toEqual([]);
    expect(getTubeHouseRowOffsets(9)).toHaveLength(MAX_TUBE_HOUSES);
  });

  it.each(STREETS)('keeps every row on tile %i inside the tile and its upper art panel', tileId => {
    const layout = getBoardTileLayout(tileId);
    if (!layout) throw new Error(`No layout for tile ${tileId}`);
    const panel = getOrientedTilePanelLayoutForTileSize(layout.size, layout.side);
    const halfWidth = panel.surfaceSize[0] / 2;
    const zCenter = panel.upperCenterLocalZ;
    const halfUpperDepth = panel.upperSize[1] / 2;
    for (let count = 1; count <= MAX_TUBE_HOUSES; count += 1) {
      for (let slot = 0; slot < count; slot += 1) {
        const local = getTubeHouseLocalPosition(tileId, slot, count);
        if (!local) throw new Error('missing slot');
        expect(Math.abs(local[0]) + TUBE_HOUSE.width / 2).toBeLessThanOrEqual(halfWidth);
        expect(Math.abs(local[2] - zCenter) + TUBE_HOUSE.depth / 2).toBeLessThanOrEqual(halfUpperDepth);
        expect(local[1]).toBe(TUBE_HOUSE_BASE_Y);
      }
    }
  });

  it('never lets two houses of a row touch', () => {
    const offsets = getTubeHouseRowOffsets(4);
    for (let index = 1; index < offsets.length; index += 1) {
      expect(offsets[index] - offsets[index - 1]).toBeGreaterThanOrEqual(TUBE_HOUSE.width + TUBE_HOUSE.gap - 1e-9);
    }
  });

  it('puts the row on the middle of the upper panel and nowhere for an unknown tile or slot', () => {
    // Usable surface depth 2.53 - 0.08 = 2.45; the upper 70% starts 0.3675 from the tile center, toward the board.
    expect(getTubeHouseRowLocalZ(1)).toBeCloseTo(-0.3675, 3);
    expect(getTubeHouseRowLocalZ(999)).toBeUndefined();
    expect(getTubeHouseLocalPosition(1, 4, 4)).toBeUndefined();
    expect(getTubeHouseWorldPlacement(999, 0, 1)).toBeUndefined();
  });

  it('turns a tile-local foot into a world position and the tile heading, for all four board sides', () => {
    for (const tileId of [1, 13, 24, 37]) {
      const layout = getBoardTileLayout(tileId);
      const placement = getTubeHouseWorldPlacement(tileId, 0, 1);
      if (!layout || !placement) throw new Error('missing placement');
      expect(placement.rotationY).toBe(layout.rotation[1]);
      expect(placement.position[1]).toBe(TUBE_HOUSE_BASE_Y);
      // A single house stands on the row's Z line: its distance from the tile center is |upperCenterLocalZ|.
      const dx = placement.position[0] - layout.position[0];
      const dz = placement.position[2] - layout.position[2];
      expect(Math.hypot(dx, dz)).toBeCloseTo(Math.abs(getTubeHouseRowLocalZ(tileId) ?? 0), 5);
    }
  });
});
