import {
  HOUSE_BODY_HEIGHT,
  HOUSE_CENTER_Y,
  HOTEL_BODY_HEIGHT,
  HOTEL_CENTER_Y,
  PLAYER_MARKER_BODY_HEIGHT,
  PLAYER_MARKER_Y,
  getBuildingSlots,
  getHotelSlot,
  getPlayerLandingAnchor,
  TILE_SURFACE_Y,
} from './architecture/tileAnchors';
import { TILE_SURFACE_EPSILON } from './architecture/boardArtSpec';

export {
  HOUSE_BODY_HEIGHT,
  HOUSE_CENTER_Y,
  HOTEL_BODY_HEIGHT,
  HOTEL_CENTER_Y,
  PLAYER_MARKER_BODY_HEIGHT,
  PLAYER_MARKER_Y,
  getBuildingSlots,
  getHotelSlot,
};

export const SURFACE_EPSILON = TILE_SURFACE_EPSILON;

/** @deprecated Use getPlayerLandingAnchor from tileAnchors for new callers. */
export function getOccupantWorldPosition(
  tileId: number,
  slotIndex: number,
): readonly [number, number, number] | undefined {
  return getPlayerLandingAnchor(tileId, slotIndex);
}

// Kept as an explicit alias for old imports while the anchor registry becomes
// the source of truth for player occupancy placement.
export { TILE_SURFACE_Y };
