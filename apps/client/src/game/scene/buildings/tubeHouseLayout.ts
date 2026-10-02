import { TILE_SURFACE_EPSILON } from '../board/architecture/boardArtSpec';
import { TILE_SURFACE_Y } from '../board/architecture/tileAnchors';
import { getBoardTileLayout, transformTileLocalPointToWorld } from '../board/boardLayout';
import { getOrientedTilePanelLayoutForTileSize } from '../board/tiles/tilePanelLayout';
import { TUBE_HOUSE } from './tubeHouseGeometry';

/** The most houses a street can hold before it becomes a hotel (a landmark). */
export const MAX_TUBE_HOUSES = 4;

/** X offsets (tile-local) of a row of `count` houses, centered on the tile with `TUBE_HOUSE.gap` between neighbours. */
export function getTubeHouseRowOffsets(count: number): readonly number[] {
  const normalized = Math.max(0, Math.min(MAX_TUBE_HOUSES, Math.floor(count)));
  const pitch = TUBE_HOUSE.width + TUBE_HOUSE.gap;
  return Array.from({ length: normalized }, (_, index) => (index - (normalized - 1) / 2) * pitch);
}

/** Tile-local Z of the row: the middle of the tile's upper art panel (the 70% away from the text footer). */
export function getTubeHouseRowLocalZ(tileId: number): number | undefined {
  const layout = getBoardTileLayout(tileId);
  if (!layout) return undefined;
  return getOrientedTilePanelLayoutForTileSize(layout.size, layout.side).upperCenterLocalZ;
}

/** Y of the foot of a house standing on the tile surface. */
export const TUBE_HOUSE_BASE_Y = TILE_SURFACE_Y + TILE_SURFACE_EPSILON;

export type TubeHousePoint = readonly [number, number, number];

/** Tile-local foot of house `slot` (0-based) in a row of `count`. */
export function getTubeHouseLocalPosition(tileId: number, slot: number, count: number): TubeHousePoint | undefined {
  const z = getTubeHouseRowLocalZ(tileId);
  const x = getTubeHouseRowOffsets(count)[slot];
  if (z === undefined || x === undefined) return undefined;
  return [x, TUBE_HOUSE_BASE_Y, z];
}

export interface TubeHouseWorldPlacement {
  position: TubeHousePoint;
  /** Rotation about Y, the tile's own. */
  rotationY: number;
}

/** World foot and heading of house `slot` in a row of `count`; the facade follows the tile's rotation. */
export function getTubeHouseWorldPlacement(tileId: number, slot: number, count: number): TubeHouseWorldPlacement | undefined {
  const layout = getBoardTileLayout(tileId);
  const local = getTubeHouseLocalPosition(tileId, slot, count);
  const position = local ? transformTileLocalPointToWorld(tileId, local) : undefined;
  if (!layout || !position) return undefined;
  return { position, rotationY: layout.rotation[1] };
}
