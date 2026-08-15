import {
  SURFACE_EPSILON,
  TILE_SURFACE_Y,
  transformTileLocalPointToWorld,
} from './boardLayout';

export const HOUSE_BODY_HEIGHT = 0.22;
export const HOTEL_BODY_HEIGHT = 0.46;
export const PLAYER_MARKER_BODY_HEIGHT = 0.26;
export const HOUSE_CENTER_Y = TILE_SURFACE_Y + SURFACE_EPSILON + HOUSE_BODY_HEIGHT / 2;
export const HOTEL_CENTER_Y = TILE_SURFACE_Y + SURFACE_EPSILON + HOTEL_BODY_HEIGHT / 2;
export const PLAYER_MARKER_Y = TILE_SURFACE_Y + SURFACE_EPSILON + PLAYER_MARKER_BODY_HEIGHT / 2;
export const PLAYER_ACTIVE_RING_TUBE_RADIUS = 0.035;
export const PLAYER_ACTIVE_RING_LOCAL_Y = -PLAYER_MARKER_BODY_HEIGHT / 2 + 0.015;
export const PLAYER_ACTIVE_RING_BOTTOM_Y = PLAYER_MARKER_Y
  + PLAYER_ACTIVE_RING_LOCAL_Y
  - PLAYER_ACTIVE_RING_TUBE_RADIUS;

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

export function getOccupantWorldPosition(
  tileId: number,
  slotIndex: number,
): readonly [number, number, number] | undefined {
  const offset = OCCUPANT_OFFSETS[slotIndex];
  return offset ? transformTileLocalPointToWorld(tileId, offset) : undefined;
}
