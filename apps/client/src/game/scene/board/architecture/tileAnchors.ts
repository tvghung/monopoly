import {
  BOARD_FOUNDATION_HEIGHT,
  HOUSE_BODY_HEIGHT,
  HOTEL_BODY_HEIGHT,
  PLAYER_MARKER_BODY_HEIGHT,
  TILE_BODY_HEIGHT,
  TILE_SOCKET_GAP,
  TILE_SURFACE_EPSILON,
} from './boardArtSpec';
import { getBoardTileLayout, transformTileLocalPointToWorld } from '../boardLayout';

export const TILE_SURFACE_Y = BOARD_FOUNDATION_HEIGHT + TILE_SOCKET_GAP + TILE_BODY_HEIGHT;
export const HOUSE_CENTER_Y = TILE_SURFACE_Y + TILE_SURFACE_EPSILON + HOUSE_BODY_HEIGHT / 2;
export const HOTEL_CENTER_Y = TILE_SURFACE_Y + TILE_SURFACE_EPSILON + HOTEL_BODY_HEIGHT / 2;
export const PLAYER_MARKER_Y = TILE_SURFACE_Y + TILE_SURFACE_EPSILON + PLAYER_MARKER_BODY_HEIGHT / 2;
export const CHARACTER_BILLBOARD_HEIGHT = 1.22;
export const CHARACTER_BASE_Y = TILE_SURFACE_Y + TILE_SURFACE_EPSILON;

const HOUSE_SLOTS: readonly (readonly [number, number, number])[] = [
  [-0.25, HOUSE_CENTER_Y, 0.19],
  [0.25, HOUSE_CENTER_Y, 0.19],
  [-0.25, HOUSE_CENTER_Y, -0.19],
  [0.25, HOUSE_CENTER_Y, -0.19],
];

type LocalPoint = readonly [number, number, number];

const CHARACTER_OFFSETS_BY_COUNT: Record<1 | 2 | 3 | 4, readonly LocalPoint[]> = {
  1: [[0, CHARACTER_BASE_Y, 0]],
  2: [[-0.28, CHARACTER_BASE_Y, 0], [0.28, CHARACTER_BASE_Y, 0]],
  3: [[-0.3, CHARACTER_BASE_Y, 0.12], [0.3, CHARACTER_BASE_Y, 0.12], [0, CHARACTER_BASE_Y, -0.24]],
  4: [
    [-0.28, CHARACTER_BASE_Y, -0.14],
    [0.28, CHARACTER_BASE_Y, -0.14],
    [-0.28, CHARACTER_BASE_Y, 0.22],
    [0.28, CHARACTER_BASE_Y, 0.22],
  ],
};

const LEGACY_PLAYER_SLOT_OFFSETS: readonly LocalPoint[] = [
  [-0.34, PLAYER_MARKER_Y, -0.2],
  [0, PLAYER_MARKER_Y, -0.34],
  [0.34, PLAYER_MARKER_Y, -0.2],
  [-0.34, PLAYER_MARKER_Y, 0.18],
  [0.34, PLAYER_MARKER_Y, 0.18],
  [-0.16, PLAYER_MARKER_Y, 0.42],
  [0.16, PLAYER_MARKER_Y, 0.42],
];

export function getCharacterOccupantOffsets(count: number): readonly LocalPoint[] {
  const normalizedCount = Math.max(1, Math.floor(count));
  if (normalizedCount <= 4) {
    return CHARACTER_OFFSETS_BY_COUNT[normalizedCount as 1 | 2 | 3 | 4];
  }

  return Array.from({ length: normalizedCount }, (_, index): LocalPoint => [
    (index % 4 - 1.5) * 0.24,
    CHARACTER_BASE_Y,
    (Math.floor(index / 4) - 0.5) * 0.32,
  ]);
}

export interface TileWorldAnchor {
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
}

export function getTileCenterAnchor(tileId: number): TileWorldAnchor | undefined {
  const layout = getBoardTileLayout(tileId);
  if (!layout) return undefined;
  return { position: layout.position, rotation: layout.rotation };
}

export function getTileSurfaceWorldY(tileId: number): number | undefined {
  const layout = getBoardTileLayout(tileId);
  return layout ? layout.position[1] + TILE_SURFACE_Y : undefined;
}

/** @deprecated Retained for non-Phase-3 compatibility tests; characters use count-aware anchors. */
export function getPlayerLandingAnchor(
  tileId: number,
  slotIndex: number,
): readonly [number, number, number] | undefined {
  if (slotIndex < 0 || slotIndex >= 7) return undefined;
  const offset = LEGACY_PLAYER_SLOT_OFFSETS[slotIndex];
  return offset ? transformTileLocalPointToWorld(tileId, offset) : undefined;
}

export function getCharacterLandingAnchor(
  tileId: number,
  slotIndex: number,
  occupantCount: number,
): readonly [number, number, number] | undefined {
  const offset = getCharacterOccupantOffsets(occupantCount)[slotIndex];
  return offset ? transformTileLocalPointToWorld(tileId, offset) : undefined;
}

export function getBuildingAnchor(
  tileId: number,
  slotIndex: number,
): readonly [number, number, number] | undefined {
  const local = slotIndex === 4
    ? [0, HOTEL_CENTER_Y, 0] as const
    : HOUSE_SLOTS[slotIndex];
  return local ? transformTileLocalPointToWorld(tileId, local) : undefined;
}

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
  return getPlayerLandingAnchor(tileId, slotIndex);
}

export {
  HOUSE_BODY_HEIGHT,
  HOTEL_BODY_HEIGHT,
  PLAYER_MARKER_BODY_HEIGHT,
};
