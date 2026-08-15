import { describe, expect, it } from 'vitest';
import {
  getBuildingSlots,
  getOccupantWorldPosition,
} from './buildingPlacement';

describe('board building and occupant placement', () => {
  it('maps authoritative development levels to visible building slots', () => {
    expect(getBuildingSlots(0)).toHaveLength(0);
    expect(getBuildingSlots(1)).toHaveLength(1);
    expect(getBuildingSlots(2)).toHaveLength(2);
    expect(getBuildingSlots(3)).toHaveLength(3);
    expect(getBuildingSlots(4)).toHaveLength(4);
    expect(getBuildingSlots(5)).toHaveLength(0);
  });

  it('provides deterministic distinct occupant anchors from the layout registry', () => {
    const positions = [0, 1, 2, 3].map(slot => getOccupantWorldPosition(1, slot));
    expect(positions.every(position => position !== undefined)).toBe(true);
    expect(new Set(positions.map(position => position?.join(','))).size).toBe(4);
    expect(getOccupantWorldPosition(999, 0)).toBeUndefined();
    expect(getOccupantWorldPosition(1, 99)).toBeUndefined();
  });
});
