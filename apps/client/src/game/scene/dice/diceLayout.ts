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
export const BASE_DICE_SIZE = 0.78;
export const DICE_SCALE = 1.70;
export const DICE_SIZE = BASE_DICE_SIZE * DICE_SCALE;
export const BASE_DICE_CENTER_OFFSET_X = 0.52;
export const DICE_CENTER_OFFSET_X = BASE_DICE_CENTER_OFFSET_X * DICE_SCALE;
// The logical envelope keeps a small side margin while staying inside the
// authored x=2 center path. It is never rendered as a platform or region.
export const DICE_ARENA_HORIZONTAL_MARGIN = 0.18;
export const DICE_ARENA_VERTICAL_MARGIN = 0.24;
// Preserve the previous center-to-body gap while moving the unchanged result
// font clear of the enlarged settled dice.
export const DICE_RESULT_DIE_CENTER_GAP_Z = 0.37;
export const DICE_ARENA_RESULT_OFFSET_Z = DICE_SIZE / 2 + DICE_RESULT_DIE_CENTER_GAP_Z;
const DICE_PAIR_FOOTPRINT_WIDTH = DICE_CENTER_OFFSET_X * 2 + DICE_SIZE;
const DICE_ARENA_HALF_DEPTH = Math.max(DICE_SIZE / 2, DICE_ARENA_RESULT_OFFSET_Z)
  + DICE_ARENA_VERTICAL_MARGIN;
export const DICE_ARENA_SIZE = Object.freeze({
  width: DICE_PAIR_FOOTPRINT_WIDTH + DICE_ARENA_HORIZONTAL_MARGIN * 2,
  depth: DICE_ARENA_HALF_DEPTH * 2,
});
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

export function getDiceSettledFootprintBounds(): DiceArenaBounds {
  const halfSize = DICE_SIZE / 2;
  return {
    minX: DICE_ARENA_CENTER_X - DICE_CENTER_OFFSET_X - halfSize,
    minZ: DICE_ARENA_CENTER_Z - halfSize,
    maxX: DICE_ARENA_CENTER_X + DICE_CENTER_OFFSET_X + halfSize,
    maxZ: DICE_ARENA_CENTER_Z + halfSize,
  };
}

export function getDicePosition(dieIndex: 0 | 1): readonly [number, number, number] {
  const x = DICE_ARENA_CENTER_X + (dieIndex === 0 ? -DICE_CENTER_OFFSET_X : DICE_CENTER_OFFSET_X);
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

function isBoundsClearOfCenterPaths(bounds: DiceArenaBounds): boolean {
  return CENTER_ORTHOGONAL_PATH_SEGMENTS.every(segment => (
    !overlaps(getCenterPathBounds(segment), bounds)
  ));
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
  return isBoundsClearOfCenterPaths(bounds);
}

export function isDiceFootprintClearOfCenterPaths(
  bounds = getDiceSettledFootprintBounds(),
): boolean {
  return isBoundsClearOfCenterPaths(bounds);
}
