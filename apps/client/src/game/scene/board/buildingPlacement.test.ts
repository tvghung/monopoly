import { describe, expect, it } from 'vitest';
import {
  HOTEL_BODY_HEIGHT,
  HOUSE_BODY_HEIGHT,
  PLAYER_MARKER_BODY_HEIGHT,
  getBuildingSlots,
  getHotelSlot,
  getOccupantWorldPosition,
} from './buildingPlacement';
import { SURFACE_EPSILON, TILE_SURFACE_Y } from './boardLayout';

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

  it('provides deterministic distinct occupant anchors from the layout registry', () => {
    const positions = [0, 1, 2, 3].map(slot => getOccupantWorldPosition(1, slot));
    expect(positions.every(position => position !== undefined)).toBe(true);
    expect(new Set(positions.map(position => position?.join(','))).size).toBe(4);
    expect(getOccupantWorldPosition(999, 0)).toBeUndefined();
    expect(getOccupantWorldPosition(1, 99)).toBeUndefined();
  });
});
