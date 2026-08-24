import { describe, expect, it } from 'vitest';
import {
  HOTEL_BODY_HEIGHT,
  HOUSE_BODY_HEIGHT,
  HOUSE_CENTER_Y,
  PLAYER_MARKER_BODY_HEIGHT,
  getBuildingSlots,
  getHotelSlot,
  getOccupantWorldPosition,
} from './buildingPlacement';
import {
  SURFACE_EPSILON,
  TILE_SURFACE_Y,
  getBoardTileLayout,
  transformTileLocalPointToWorld,
} from './boardLayout';
import { HOUSE_BODY_DEPTH, HOUSE_BODY_WIDTH } from './architecture/boardArtSpec';

describe('board building and occupant placement', () => {
  it('maps authoritative development levels to visible building slots', () => {
    expect(getBuildingSlots(0)).toHaveLength(0);
    expect(getBuildingSlots(1)).toHaveLength(1);
    expect(getBuildingSlots(2)).toHaveLength(2);
    expect(getBuildingSlots(3)).toHaveLength(3);
    expect(getBuildingSlots(4)).toHaveLength(4);
    expect(getBuildingSlots(5)).toHaveLength(0);
  });

  it('keeps building bodies and player markers above the tile surface', () => {
    getBuildingSlots(4).forEach(position => {
      expect(position[1] - HOUSE_BODY_HEIGHT / 2)
        .toBeCloseTo(TILE_SURFACE_Y + SURFACE_EPSILON);
    });
    expect(getHotelSlot()[1] - HOTEL_BODY_HEIGHT / 2)
      .toBeCloseTo(TILE_SURFACE_Y + SURFACE_EPSILON);
    expect((getOccupantWorldPosition(1, 0)?.[1] ?? 0) - PLAYER_MARKER_BODY_HEIGHT / 2)
      .toBeCloseTo(TILE_SURFACE_Y + SURFACE_EPSILON);
  });

  it('keeps the enlarged four-house footprint inside the canonical edge tile', () => {
    const [tileWidth, tileDepth] = getBoardTileLayout(1)!.size;
    getBuildingSlots(4).forEach(position => {
      expect(Math.abs(position[0]) + HOUSE_BODY_WIDTH / 2).toBeLessThan(tileWidth / 2);
      expect(Math.abs(position[2]) + HOUSE_BODY_DEPTH / 2).toBeLessThan(tileDepth / 2);
    });
  });

  it.each([
    [1, [6.74, HOUSE_CENTER_Y, 8.61]],
    [11, [-8.61, HOUSE_CENTER_Y, 6.74]],
    [21, [-6.74, HOUSE_CENTER_Y, -8.61]],
    [31, [8.61, HOUSE_CENTER_Y, -6.74]],
  ] as const)('transforms a local building anchor once for tile %i', (tileId, expected) => {
    const actual = transformTileLocalPointToWorld(tileId, [0.34, HOUSE_CENTER_Y, 0.18]);
    expect(actual).toBeDefined();
    actual?.forEach((coordinate, index) => expect(coordinate).toBeCloseTo(expected[index]));
  });

  it('provides deterministic distinct occupant anchors from the layout registry', () => {
    const positions = [0, 1, 2, 3].map(slot => getOccupantWorldPosition(1, slot));
    expect(positions.every(position => position !== undefined)).toBe(true);
    expect(new Set(positions.map(position => position?.join(','))).size).toBe(4);
    expect(getOccupantWorldPosition(999, 0)).toBeUndefined();
    expect(getOccupantWorldPosition(1, 99)).toBeUndefined();
  });
});
