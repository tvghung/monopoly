import type * as THREE from 'three';
import { STREET_PASTELS } from './kit/kitMaterials';
import { bevelBox, box, gableRoof, mergeKit, plate } from './kit/lowPolyKit';

/**
 * The nhà ống (tube house) of plan 05 §8.2: a narrow, chunky Vietnamese street house. Three geometries are shared by every
 * house of the board and drawn as three `InstancedMesh`es: the body (tinted per instance with a street pastel), the trim
 * (windows, door and balcony rail, vertex colors only) and the roof slab (tinted per instance with the owner's color).
 * The facade faces both +Z and -Z, so it reads from whichever side of the board the camera sees the tile.
 */
export const TUBE_HOUSE = {
  width: 0.30,
  depth: 0.36,
  height: 0.50,
  /** Space between neighbours in a row. */
  gap: 0.06,
  bevel: 0.03,
  roofHeight: 0.07,
  roofOverhang: 0.02,
} as const;

/** Triangle budget of one house (body + trim + roof), plan 05 §8.2. */
export const TUBE_HOUSE_TRIANGLE_BUDGET = 180;

const INK = '#35495E';
const DOOR = '#7A4B2A';
const WHITE = '#FFFFFF';
const RAIL = '#F8F4EA';

/** The body, white so the instance color alone decides the facade color. */
export function buildTubeHouseBody(): THREE.BufferGeometry {
  return bevelBox(TUBE_HOUSE.width, TUBE_HOUSE.height, TUBE_HOUSE.depth, TUBE_HOUSE.bevel, WHITE);
}

/** Windows, door and balcony rail on both long faces, baked as vertex-colored geometry. */
export function buildTubeHouseTrim(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const faceZ = TUBE_HOUSE.depth / 2 + 0.002;
  for (const side of [1, -1] as const) {
    const rotation = side === 1 ? [0, 0, 0] as const : [0, Math.PI, 0] as const;
    const at = (x: number, y: number) => ({ position: [x, y, faceZ * side] as const, rotation });
    // Ground floor: the door. First and second floor: two windows each.
    parts.push(plate(0.07, 0.13, DOOR, at(0, 0.02)));
    for (const x of [-0.07, 0.07]) {
      parts.push(plate(0.07, 0.08, INK, at(x, 0.22)));
      parts.push(plate(0.07, 0.08, INK, at(x, 0.36)));
    }
    // The balcony rail runs across the face above the ground floor.
    parts.push(box(TUBE_HOUSE.width - 0.04, 0.02, 0.03, RAIL, { position: [0, 0.17, (TUBE_HOUSE.depth / 2 + 0.012) * side] }));
  }
  return mergeKit(parts);
}

/** A low gable slab over the top, ridge along X, so both slopes face the street sides. White: tinted with the owner's color. */
export function buildTubeHouseRoof(): THREE.BufferGeometry {
  return gableRoof(
    TUBE_HOUSE.width + TUBE_HOUSE.roofOverhang * 2,
    TUBE_HOUSE.depth + TUBE_HOUSE.roofOverhang * 2,
    TUBE_HOUSE.roofHeight,
    WHITE,
    { position: [0, TUBE_HOUSE.height - 0.004, 0] },
  );
}

/** The facade pastel of a house, deterministic from its tile and its slot (plan 05 §8.2). */
export function getTubeHouseFacadeColor(tileId: number, slot: number): string {
  return STREET_PASTELS[(tileId * 7 + slot) % STREET_PASTELS.length];
}
