import {
  PLATFORM_HEIGHT,
  TILE_HEIGHT,
  getBoardTileLayout,
} from './boardLayout';

export const BUILDING_BASE_Y = PLATFORM_HEIGHT + TILE_HEIGHT + 0.02;
export const PLAYER_MARKER_Y = PLATFORM_HEIGHT + TILE_HEIGHT + 0.42;

const HOUSE_SLOTS: readonly (readonly [number, number, number])[] = [
  [-0.34, BUILDING_BASE_Y, 0.18],
  [0, BUILDING_BASE_Y, 0.18],
  [0.34, BUILDING_BASE_Y, 0.18],
  [0, BUILDING_BASE_Y, -0.22],
];

const OCCUPANT_OFFSETS: readonly (readonly [number, number, number])[] = [
  [-0.34, PLAYER_MARKER_Y, -0.2],
  [0, PLAYER_MARKER_Y, -0.34],
  [0.34, PLAYER_MARKER_Y, -0.2],
  [-0.34, PLAYER_MARKER_Y, 0.18],
  [0.34, PLAYER_MARKER_Y, 0.18],
  [-0.16, PLAYER_MARKER_Y, 0.42],
  [0.16, PLAYER_MARKER_Y, 0.42],
];

export function getBuildingSlots(houses: number): readonly (readonly [number, number, number])[] {
  return houses >= 1 && houses <= 4 ? HOUSE_SLOTS.slice(0, houses) : [];
}

export function getHotelSlot(): readonly [number, number, number] {
  return [0, BUILDING_BASE_Y, 0];
}

function rotateY(offset: readonly [number, number, number], rotation: number): readonly [number, number, number] {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return [cos * offset[0] + sin * offset[2], offset[1], -sin * offset[0] + cos * offset[2]];
}

export function getOccupantWorldPosition(
  tileId: number,
  slotIndex: number,
): readonly [number, number, number] | undefined {
  const layout = getBoardTileLayout(tileId);
  const offset = OCCUPANT_OFFSETS[slotIndex];
  if (!layout || !offset) return undefined;
  const rotated = rotateY(offset, layout.rotation[1]);
  return [
    layout.position[0] + rotated[0],
    rotated[1],
    layout.position[2] + rotated[2],
  ];
}
