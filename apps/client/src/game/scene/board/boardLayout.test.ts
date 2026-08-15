import { describe, expect, it } from 'vitest';
import {
  CORNER_SIZE,
  EDGE_TILE_DEPTH,
  EDGE_TILE_WIDTH,
  PLATFORM_HEIGHT,
  SURFACE_EPSILON,
  TILE_GAP,
  TILE_HEIGHT,
  TILE_SURFACE_Y,
  boardLayout,
  getBoardTileLayout,
} from './boardLayout';

describe('canonical 2.5D board layout', () => {
  it('contains exactly the canonical 40 tile IDs without duplicate centers', () => {
    expect(boardLayout).toHaveLength(40);
    expect(boardLayout.map(layout => layout.tileId)).toEqual([...Array(40).keys()]);

    const centers = boardLayout.map(layout => layout.position.join(','));
    expect(new Set(centers).size).toBe(40);
    expect(boardLayout.every(layout => layout.position.every(Number.isFinite))).toBe(true);
    expect(boardLayout.every(layout => layout.rotation.every(Number.isFinite))).toBe(true);
  });

  it('keeps corners and side ranges in canonical travel order', () => {
    expect(boardLayout.filter(layout => layout.side === 'CORNER').map(layout => layout.tileId))
      .toEqual([0, 10, 20, 30]);
    expect(boardLayout.filter(layout => layout.side === 'BOTTOM').map(layout => layout.tileId))
      .toEqual(Array.from({ length: 9 }, (_, index) => index + 1));
    expect(boardLayout.filter(layout => layout.side === 'LEFT').map(layout => layout.tileId))
      .toEqual(Array.from({ length: 9 }, (_, index) => index + 11));
    expect(boardLayout.filter(layout => layout.side === 'TOP').map(layout => layout.tileId))
      .toEqual(Array.from({ length: 9 }, (_, index) => index + 21));
    expect(boardLayout.filter(layout => layout.side === 'RIGHT').map(layout => layout.tileId))
      .toEqual(Array.from({ length: 9 }, (_, index) => index + 31));

    const bottom = boardLayout.filter(layout => layout.side === 'BOTTOM');
    const left = boardLayout.filter(layout => layout.side === 'LEFT');
    const top = boardLayout.filter(layout => layout.side === 'TOP');
    const right = boardLayout.filter(layout => layout.side === 'RIGHT');
    expect(bottom.every((layout, index) => index === 0 || layout.position[0] < bottom[index - 1].position[0])).toBe(true);
    expect(left.every((layout, index) => index === 0 || layout.position[2] < left[index - 1].position[2])).toBe(true);
    expect(top.every((layout, index) => index === 0 || layout.position[0] > top[index - 1].position[0])).toBe(true);
    expect(right.every((layout, index) => index === 0 || layout.position[2] > right[index - 1].position[2])).toBe(true);
  });

  it('uses the centralized nominal dimensions for side and corner meshes', () => {
    expect(boardLayout.filter(layout => layout.side !== 'CORNER')
      .every(layout => layout.size[0] === EDGE_TILE_WIDTH - TILE_GAP
        && layout.size[1] === EDGE_TILE_DEPTH - TILE_GAP)).toBe(true);
    expect(boardLayout.filter(layout => layout.side === 'CORNER')
      .every(layout => layout.size[0] === CORNER_SIZE - TILE_GAP
        && layout.size[1] === CORNER_SIZE - TILE_GAP)).toBe(true);
    expect(TILE_SURFACE_Y).toBe(PLATFORM_HEIGHT + TILE_HEIGHT);
    expect(SURFACE_EPSILON).toBeGreaterThan(0);
  });

  it.each([
    [1, 'BOTTOM', [5.6, 0, 7.5], 0],
    [11, 'LEFT', [-7.5, 0, 5.6], -Math.PI / 2],
    [21, 'TOP', [-5.6, 0, -7.5], Math.PI],
    [31, 'RIGHT', [7.5, 0, -5.6], Math.PI / 2],
  ] as const)('keeps tile %i on its canonical world transform', (tileId, side, position, rotationY) => {
    const layout = getBoardTileLayout(tileId);
    expect(layout?.side).toBe(side);
    position.forEach((coordinate, index) => {
      expect(layout?.position[index]).toBeCloseTo(coordinate);
    });
    expect(layout?.rotation).toEqual([0, rotationY, 0]);
  });

  it('looks up valid IDs and safely rejects invalid IDs', () => {
    expect(getBoardTileLayout(0)?.tileId).toBe(0);
    expect(getBoardTileLayout(39)?.tileId).toBe(39);
    expect(getBoardTileLayout(-1)).toBeUndefined();
    expect(getBoardTileLayout(40)).toBeUndefined();
  });
});
