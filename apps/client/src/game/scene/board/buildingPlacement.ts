import {
  SURFACE_EPSILON,
  TILE_SURFACE_Y,
  getBoardTileLayout,
} from './boardLayout';

export const HOUSE_BODY_HEIGHT = 0.22;
export const HOTEL_BODY_HEIGHT = 0.46;
export const PLAYER_MARKER_BODY_HEIGHT = 0.26;
export const HOUSE_CENTER_Y = TILE_SURFACE_Y + SURFACE_EPSILON + HOUSE_BODY_HEIGHT / 2;
export const HOTEL_CENTER_Y = TILE_SURFACE_Y + SURFACE_EPSILON + HOTEL_BODY_HEIGHT / 2;
export const PLAYER_MARKER_Y = TILE_SURFACE_Y + SURFACE_EPSILON + PLAYER_MARKER_BODY_HEIGHT / 2;

const HOUSE_SLOTS: readonly (readonly [number, number, number])[] = [
  [-0.34, HOUSE_CENTER_Y, 0.18],
  [0, HOUSE_CENTER_Y, 0.18],
  [0.34, HOUSE_CENTER_Y, 0.18],
  [0, HOUSE_CENTER_Y, -0.22],
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
  return [0, HOTEL_CENTER_Y, 0];
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
