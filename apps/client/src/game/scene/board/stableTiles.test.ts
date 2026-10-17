import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { tileState } from '@monopoly/shared';
import { getTileBoardName } from '../../ui/formatters';
import type { BoardTileRenderModel } from './boardRenderModel';
import { deriveBoardTiles, shareTilesStructurally, useBoardTiles } from './stableTiles';

/** What `buildBoardRenderModel` produces: a brand-new array of brand-new objects for the same data. */
function modelTiles(overrides: Record<number, Partial<BoardTileRenderModel>> = {}): BoardTileRenderModel[] {
  return tileState.map((tile, tileId): BoardTileRenderModel => ({
    tileId,
    name: `model-name-${tileId}`,
    tileType: tile.tileType,
    ...(typeof tile.price === 'number' ? { price: tile.price } : {}),
    ...(tile.color ? { propertyColor: tile.color } : {}),
    houses: 0,
    ...overrides[tileId],
  }));
}

describe('shareTilesStructurally', () => {
  it('returns the next array untouched when there is nothing to share with', () => {
    const next = modelTiles();
    expect(shareTilesStructurally(null, next)).toBe(next);
  });

  it('returns the previous array when every tile is equal by value', () => {
    const previous = modelTiles();
    expect(shareTilesStructurally(previous, modelTiles())).toBe(previous);
  });

  it('builds a new array that still shares every unchanged tile object when one tile changes', () => {
    const previous = modelTiles();
    const next = modelTiles({ 3: { houses: 2, ownerId: 'a', ownerColor: 'red' } });
    const shared = shareTilesStructurally(previous, next);
    expect(shared).not.toBe(previous);
    expect(shared[3]).toBe(next[3]);
    expect(shared[3].houses).toBe(2);
    shared.forEach((tile, index) => { if (index !== 3) expect(tile).toBe(previous[index]); });
  });

  it('notices every kind of change: a field value, an added field, a removed field and a different length', () => {
    const previous = modelTiles({ 5: { ownerId: 'a', ownerColor: 'red' } });
    expect(shareTilesStructurally(previous, modelTiles({ 5: { ownerId: 'b', ownerColor: 'red' } }))).not.toBe(previous);
    expect(shareTilesStructurally(previous, modelTiles({ 5: { ownerId: 'a', ownerColor: 'red', price: 1 } }))).not.toBe(previous);
    expect(shareTilesStructurally(previous, modelTiles())).not.toBe(previous);
    expect(shareTilesStructurally(previous, previous.slice(0, 39).map(tile => ({ ...tile })))).toHaveLength(39);
  });

  it('preserves tile order and ids', () => {
    const shared = shareTilesStructurally(modelTiles(), modelTiles({ 10: { houses: 1 } }));
    expect(shared.map(tile => tile.tileId)).toEqual(Array.from({ length: 40 }, (_, index) => index));
  });
});

describe('deriveBoardTiles', () => {
  it('localizes board names and keeps every other field of the model tile', () => {
    const [first] = deriveBoardTiles(modelTiles({ 1: { ownerId: 'a', ownerColor: 'red', houses: 3 } }), 'en');
    expect(first.name).toBe(getTileBoardName(0, 'en'));
    const owned = deriveBoardTiles(modelTiles({ 1: { ownerId: 'a', ownerColor: 'red', houses: 3 } }), 'vi')[1];
    expect(owned).toMatchObject({ tileId: 1, ownerId: 'a', ownerColor: 'red', houses: 3, name: getTileBoardName(1, 'vi') });
  });

  it('describes the static board when there is no model', () => {
    const tiles = deriveBoardTiles(undefined, 'vi');
    expect(tiles).toHaveLength(40);
    expect(tiles[0]).toMatchObject({ tileId: 0, tileType: tileState[0].tileType, houses: 0, name: getTileBoardName(0, 'vi') });
    expect(tiles[1].propertyColor).toBe(tileState[1].color);
  });
});

describe('useBoardTiles (audit PERF-01/02: a new tile array per board render rebuilt GPU resources)', () => {
  it('keeps the same array across re-renders that bring equal model data in new objects', () => {
    const { result, rerender } = renderHook(
      ({ tiles, language }) => useBoardTiles(tiles, language),
      { initialProps: { tiles: modelTiles(), language: 'vi' as const } },
    );
    const first = result.current;
    for (let render = 0; render < 5; render += 1) rerender({ tiles: modelTiles(), language: 'vi' });
    expect(result.current).toBe(first);
  });

  it('keeps the array when the same model is rendered again (hover and selection re-render the board)', () => {
    const tiles = modelTiles();
    const { result, rerender } = renderHook(
      ({ model }) => useBoardTiles(model, 'vi'),
      { initialProps: { model: tiles } },
    );
    const first = result.current;
    rerender({ model: tiles });
    expect(result.current).toBe(first);
  });

  it('updates when the game state changes a tile, and only that tile gets a new object', () => {
    const { result, rerender } = renderHook(
      ({ tiles }) => useBoardTiles(tiles, 'vi'),
      { initialProps: { tiles: modelTiles() } },
    );
    const before = result.current;
    rerender({ tiles: modelTiles({ 6: { ownerId: 'p1', ownerColor: 'blue', houses: 1 } }) });
    const after = result.current;
    expect(after).not.toBe(before);
    expect(after[6]).toMatchObject({ ownerId: 'p1', ownerColor: 'blue', houses: 1 });
    expect(after[7]).toBe(before[7]);
    // A further equal update keeps the changed state's identity.
    rerender({ tiles: modelTiles({ 6: { ownerId: 'p1', ownerColor: 'blue', houses: 1 } }) });
    expect(result.current).toBe(after);
  });

  it('switches names with the language and switches back to the same content', () => {
    const { result, rerender } = renderHook(
      ({ language }) => useBoardTiles(modelTiles(), language),
      { initialProps: { language: 'vi' as 'vi' | 'en' } },
    );
    // Tile 0 (the start tile) is named differently per language; a street's proper name is the same in both.
    const vietnamese = result.current;
    expect(vietnamese[0].name).toBe(getTileBoardName(0, 'vi'));
    rerender({ language: 'en' });
    const en = result.current;
    expect(en).not.toBe(vietnamese);
    expect(en[0].name).toBe(getTileBoardName(0, 'en'));
    expect(en[0].name).not.toBe(vietnamese[0].name);
    rerender({ language: 'en' });
    expect(result.current).toBe(en);
  });

  it('renders the static board without a model and stays stable', () => {
    const { result, rerender } = renderHook(() => useBoardTiles(undefined, 'vi'));
    const first = result.current;
    expect(first).toHaveLength(40);
    rerender();
    expect(result.current).toBe(first);
  });
});
