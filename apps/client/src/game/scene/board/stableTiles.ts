import { useLayoutEffect, useMemo, useRef } from 'react';
import { tileState } from '@monopoly/shared';
import type { Language } from '../../../i18n/I18n';
import { getTileBoardName } from '../../ui/formatters';
import type { BoardTileRenderModel } from './boardRenderModel';

function sameTile(left: BoardTileRenderModel, right: BoardTileRenderModel): boolean {
  const leftKeys = Object.keys(left) as (keyof BoardTileRenderModel)[];
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every(key => Object.hasOwn(right, key) && Object.is(left[key], right[key]));
}

/**
 * Keeps the previous tile objects (and the previous array) when nothing about them changed. Compares every field of every
 * tile by value, so a changed owner, house count, name or any future field produces a new object and a new array and the
 * consumers update exactly as before; only equal data keeps its identity.
 */
export function shareTilesStructurally(
  previous: readonly BoardTileRenderModel[] | null,
  next: readonly BoardTileRenderModel[],
): readonly BoardTileRenderModel[] {
  if (!previous) return next;
  let changed = previous.length !== next.length;
  const shared = next.map((tile, index) => {
    const before = previous[index];
    if (before && sameTile(before, tile)) return before;
    changed = true;
    return tile;
  });
  return changed ? shared : previous;
}

/** The tiles the board renders: the model's tiles (or the static board when there is no model) with localized board names. */
export function deriveBoardTiles(
  modelTiles: readonly BoardTileRenderModel[] | undefined,
  language: Language,
): BoardTileRenderModel[] {
  const sourceTiles: readonly BoardTileRenderModel[] = modelTiles ?? tileState.map((tile, tileId) => ({
    tileId,
    name: '',
    tileType: tile.tileType,
    price: tile.price,
    propertyColor: tile.color,
    houses: 0,
  }));
  return sourceTiles.map(tile => ({ ...tile, name: getTileBoardName(tile.tileId, language) }));
}

/**
 * Stable `tiles` for the board's batches (audit PERF-01/02/14: a new array per render made the highlight batch and the
 * special-tile visuals rebuild GPU resources). The array only changes identity when a tile value or the language changes.
 */
export function useBoardTiles(
  modelTiles: readonly BoardTileRenderModel[] | undefined,
  language: Language,
): readonly BoardTileRenderModel[] {
  const derived = useMemo(() => deriveBoardTiles(modelTiles, language), [modelTiles, language]);
  const committedRef = useRef<readonly BoardTileRenderModel[] | null>(null);
  const tiles = useMemo(() => shareTilesStructurally(committedRef.current, derived), [derived]);
  useLayoutEffect(() => {
    committedRef.current = tiles;
  }, [tiles]);
  return tiles;
}
