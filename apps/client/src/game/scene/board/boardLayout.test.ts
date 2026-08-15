import { describe, expect, it } from 'vitest';
import {
  CORNER_SIZE,
  CARD_DECK_CENTER_Y,
  CARD_HEIGHT,
  EDGE_TILE_DEPTH,
  EDGE_TILE_WIDTH,
  JAIL_BASE_CENTER_Y,
  JAIL_BASE_HEIGHT,
  OWNERSHIP_MARKER_CENTER_Y,
  OWNERSHIP_MARKER_HEIGHT,
  PLATFORM_HEIGHT,
  PROPERTY_ACCENT_CENTER_Y,
  PROPERTY_ACCENT_HEIGHT,
  SELECTION_EDGE_HEIGHT,
  SELECTION_MARKER_CENTER_Y,
  SURFACE_EPSILON,
  TILE_SURFACE_CLEARANCE_Y,
  TILE_GAP,
  TILE_HEIGHT,
  TILE_SURFACE_Y,
  TILE_SURFACE_LOCAL_POSITION,
  TILE_SURFACE_LOCAL_ROTATION,
  boardLayout,
  getGeometryBottomY,
  getBoardTileLayout,
  getTileSurfaceGeometry,
  getTileSurfaceWorldCorners,
} from './boardLayout';
import { TILE_SOCKET_GAP } from './architecture/boardArtSpec';

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
    expect(TILE_SURFACE_Y).toBe(PLATFORM_HEIGHT + TILE_SOCKET_GAP + TILE_HEIGHT);
    expect(SURFACE_EPSILON).toBeGreaterThan(0);
  });

  it('keeps physical tile overlays at or above the canonical surface clearance', () => {
    const surface = TILE_SURFACE_CLEARANCE_Y;
    expect(getGeometryBottomY(PROPERTY_ACCENT_CENTER_Y, PROPERTY_ACCENT_HEIGHT))
      .toBeGreaterThanOrEqual(surface);
    expect(getGeometryBottomY(OWNERSHIP_MARKER_CENTER_Y, OWNERSHIP_MARKER_HEIGHT))
      .toBeGreaterThanOrEqual(surface);
    expect(getGeometryBottomY(SELECTION_MARKER_CENTER_Y, SELECTION_EDGE_HEIGHT))
      .toBeGreaterThanOrEqual(surface);
    expect(getGeometryBottomY(CARD_DECK_CENTER_Y, CARD_HEIGHT))
      .toBeGreaterThanOrEqual(surface);
    expect(getGeometryBottomY(surface + JAIL_BASE_CENTER_Y, JAIL_BASE_HEIGHT))
      .toBeGreaterThanOrEqual(surface);
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

  it.each([
    [1, 'BOTTOM', EDGE_TILE_WIDTH - TILE_GAP - 0.08, EDGE_TILE_DEPTH - TILE_GAP - 0.08],
    [11, 'LEFT', EDGE_TILE_DEPTH - TILE_GAP - 0.08, EDGE_TILE_WIDTH - TILE_GAP - 0.08],
    [21, 'TOP', EDGE_TILE_WIDTH - TILE_GAP - 0.08, EDGE_TILE_DEPTH - TILE_GAP - 0.08],
    [31, 'RIGHT', EDGE_TILE_DEPTH - TILE_GAP - 0.08, EDGE_TILE_WIDTH - TILE_GAP - 0.08],
  ] as const)('transforms tile %i surface footprint with its canonical side rotation', (tileId, side, expectedWorldWidth, expectedWorldDepth) => {
    const layout = getBoardTileLayout(tileId);
    const surface = layout ? getTileSurfaceGeometry(layout) : undefined;
    const corners = getTileSurfaceWorldCorners(tileId);
    expect(layout?.side).toBe(side);
    expect(surface?.position).toEqual(TILE_SURFACE_LOCAL_POSITION);
    expect(surface?.rotation).toEqual(TILE_SURFACE_LOCAL_ROTATION);
    expect(corners).toHaveLength(4);
    const worldWidth = Math.max(...corners!.map(corner => corner[0]))
      - Math.min(...corners!.map(corner => corner[0]));
    const worldDepth = Math.max(...corners!.map(corner => corner[2]))
      - Math.min(...corners!.map(corner => corner[2]));
    expect(worldWidth).toBeCloseTo(expectedWorldWidth);
    expect(worldDepth).toBeCloseTo(expectedWorldDepth);
    corners!.forEach(corner => expect(corner[1]).toBeCloseTo(TILE_SURFACE_LOCAL_POSITION[1]));
  });

  it('looks up valid IDs and safely rejects invalid IDs', () => {
    expect(getBoardTileLayout(0)?.tileId).toBe(0);
    expect(getBoardTileLayout(39)?.tileId).toBe(39);
    expect(getBoardTileLayout(-1)).toBeUndefined();
    expect(getBoardTileLayout(40)).toBeUndefined();
  });
});
