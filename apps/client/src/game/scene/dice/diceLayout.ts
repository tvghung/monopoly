import {
  CENTER_FIELD_CLEARANCE,
  INNER_TILE_SURFACE_BOUNDARY,
} from '../board/boardLayout';
import { CENTER_AIRPORT_FIELD_TOP_Y } from '../board/architecture/boardArtSpec';
import {
  CENTER_ORTHOGONAL_PATH_SEGMENTS,
  getCenterPathBounds,
} from '../board/center/centerFieldPathLayout';
import { AIRPORT_RUNWAY_INNER_HALF_SIZE } from '../board/center/airportRunwayGeometry';

export const DICE_ARENA_CENTER_X = 0;
export const DICE_ARENA_CENTER_Z = -1.65;
export const DICE_ARENA_SIZE = Object.freeze({ width: 2.8, depth: 1.75 });
export const DICE_SIZE = 0.78;
export const DICE_ARENA_RESULT_OFFSET_Z = 0.76;
export const DICE_DROP_HEIGHT = 1.35;

export interface DiceArenaBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export function getDiceArenaBounds(): DiceArenaBounds {
  return {
    minX: DICE_ARENA_CENTER_X - DICE_ARENA_SIZE.width / 2,
    minZ: DICE_ARENA_CENTER_Z - DICE_ARENA_SIZE.depth / 2,
    maxX: DICE_ARENA_CENTER_X + DICE_ARENA_SIZE.width / 2,
    maxZ: DICE_ARENA_CENTER_Z + DICE_ARENA_SIZE.depth / 2,
  };
}

export function getDicePosition(dieIndex: 0 | 1): readonly [number, number, number] {
  const x = DICE_ARENA_CENTER_X + (dieIndex === 0 ? -0.52 : 0.52);
  return [x, CENTER_AIRPORT_FIELD_TOP_Y + DICE_SIZE / 2, DICE_ARENA_CENTER_Z];
}

export function getDiceResultPosition(): readonly [number, number, number] {
  return [
    DICE_ARENA_CENTER_X,
    CENTER_AIRPORT_FIELD_TOP_Y + 0.014,
    DICE_ARENA_CENTER_Z + DICE_ARENA_RESULT_OFFSET_Z,
  ];
}

function overlaps(left: readonly [number, number, number, number], right: DiceArenaBounds): boolean {
  return left[0] <= right.maxX
    && left[2] >= right.minX
    && left[1] <= right.maxZ
    && left[3] >= right.minZ;
}

export function isDiceArenaInsideCenterField(bounds = getDiceArenaBounds()): boolean {
  const centerHalfSize = AIRPORT_RUNWAY_INNER_HALF_SIZE - CENTER_FIELD_CLEARANCE;
  return bounds.minX >= -centerHalfSize
    && bounds.maxX <= centerHalfSize
    && bounds.minZ >= -centerHalfSize
    && bounds.maxZ <= centerHalfSize
    && bounds.minX >= -INNER_TILE_SURFACE_BOUNDARY + CENTER_FIELD_CLEARANCE
    && bounds.maxX <= INNER_TILE_SURFACE_BOUNDARY - CENTER_FIELD_CLEARANCE
    && bounds.minZ >= -INNER_TILE_SURFACE_BOUNDARY + CENTER_FIELD_CLEARANCE
    && bounds.maxZ <= INNER_TILE_SURFACE_BOUNDARY - CENTER_FIELD_CLEARANCE;
}

export function isDiceArenaClearOfCenterPaths(
  bounds = getDiceArenaBounds(),
): boolean {
  return CENTER_ORTHOGONAL_PATH_SEGMENTS.every(segment => (
    !overlaps(getCenterPathBounds(segment), bounds)
  ));
}
