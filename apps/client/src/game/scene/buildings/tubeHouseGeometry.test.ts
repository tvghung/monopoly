import { colorGroups } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import { STREET_PASTELS } from './kit/kitMaterials';
import { measureGeometry, triangleCount } from './kit/lowPolyKit';
import {
  TUBE_HOUSE,
  TUBE_HOUSE_TRIANGLE_BUDGET,
  buildTubeHouseBody,
  buildTubeHouseRoof,
  buildTubeHouseTrim,
  getTubeHouseFacadeColor,
} from './tubeHouseGeometry';

describe('tube house geometry', () => {
  it('keeps a whole house inside the triangle budget', () => {
    const total = triangleCount(buildTubeHouseBody()) + triangleCount(buildTubeHouseTrim()) + triangleCount(buildTubeHouseRoof());
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(TUBE_HOUSE_TRIANGLE_BUDGET);
  });

  it('is a narrow tube: the body has the specified footprint and height', () => {
    const { size, min } = measureGeometry(buildTubeHouseBody());
    expect(size[0]).toBeCloseTo(TUBE_HOUSE.width);
    expect(size[1]).toBeCloseTo(TUBE_HOUSE.height);
    expect(size[2]).toBeCloseTo(TUBE_HOUSE.depth);
    expect(min[1]).toBe(0);
    expect(size[1]).toBeGreaterThan(size[0]);
  });

  it('keeps the trim on the two long faces, just outside the wall', () => {
    const { min, max } = measureGeometry(buildTubeHouseTrim());
    expect(min[2]).toBeLessThan(-TUBE_HOUSE.depth / 2);
    expect(max[2]).toBeGreaterThan(TUBE_HOUSE.depth / 2);
    expect(max[2]).toBeLessThan(TUBE_HOUSE.depth / 2 + 0.05);
    expect(max[0]).toBeLessThanOrEqual(TUBE_HOUSE.width / 2);
    expect(min[0]).toBeGreaterThanOrEqual(-TUBE_HOUSE.width / 2);
    expect(max[1]).toBeLessThan(TUBE_HOUSE.height);
  });

  it('puts a roof slab on top that overhangs the body slightly', () => {
    const roof = measureGeometry(buildTubeHouseRoof());
    expect(roof.size[0]).toBeCloseTo(TUBE_HOUSE.width + TUBE_HOUSE.roofOverhang * 2);
    expect(roof.size[2]).toBeCloseTo(TUBE_HOUSE.depth + TUBE_HOUSE.roofOverhang * 2);
    expect(roof.min[1]).toBeLessThanOrEqual(TUBE_HOUSE.height);
    expect(roof.max[1]).toBeCloseTo(TUBE_HOUSE.height - 0.004 + TUBE_HOUSE.roofHeight);
  });

  it('paints the body and the roof white so the instance color decides their color', () => {
    for (const geometry of [buildTubeHouseBody(), buildTubeHouseRoof()]) {
      const color = geometry.getAttribute('color');
      for (let index = 0; index < color.count; index += 1) {
        expect([color.getX(index), color.getY(index), color.getZ(index)]).toEqual([1, 1, 1]);
      }
    }
  });

  it('chooses the facade pastel deterministically from the tile and the slot, always from the palette', () => {
    for (const tileId of Object.values(colorGroups).flat()) {
      for (let slot = 0; slot < 4; slot += 1) {
        const color = getTubeHouseFacadeColor(tileId, slot);
        expect(STREET_PASTELS).toContain(color);
        expect(getTubeHouseFacadeColor(tileId, slot)).toBe(color);
      }
    }
    expect(getTubeHouseFacadeColor(1, 0)).toBe(STREET_PASTELS[7 % 6]);
    // Neighbouring houses of one tile differ, so a row does not look like one block.
    expect(new Set([0, 1, 2, 3].map(slot => getTubeHouseFacadeColor(6, slot))).size).toBe(4);
  });
});
