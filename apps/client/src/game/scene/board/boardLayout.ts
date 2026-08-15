export type BoardSide = 'BOTTOM' | 'LEFT' | 'TOP' | 'RIGHT' | 'CORNER';

export const CORNER_SIZE = 2.4;
export const EDGE_TILE_WIDTH = 1.4;
export const EDGE_TILE_DEPTH = 2.4;
export const TILE_GAP = 0.05;
export const TILE_HEIGHT = 0.28;
export const PLATFORM_HEIGHT = 0.42;
export const TILE_SURFACE_Y = PLATFORM_HEIGHT + TILE_HEIGHT;
export const SURFACE_EPSILON = 0.02;

export const OUTER_BOARD_SIZE = 2 * CORNER_SIZE + 9 * EDGE_TILE_WIDTH;
export const CORNER_CENTER = OUTER_BOARD_SIZE / 2 - CORNER_SIZE / 2;
export const INNER_SIDE_BOUNDARY = OUTER_BOARD_SIZE / 2 - CORNER_SIZE;

const SIDE_ROTATIONS: Record<Exclude<BoardSide, 'CORNER'>, number> = {
  BOTTOM: 0,
  LEFT: -Math.PI / 2,
  TOP: Math.PI,
  RIGHT: Math.PI / 2,
};

const CORNER_ROTATIONS: Record<number, number> = {
  0: 0,
  10: -Math.PI / 2,
  20: Math.PI,
  30: Math.PI / 2,
};

export interface BoardTileLayout {
  tileId: number;
  side: BoardSide;
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  /** Local mesh footprint as [width, depth]. Side tiles rotate this footprint. */
  size: readonly [number, number];
}

const SIDE_TILE_SIZE: readonly [number, number] = [
  EDGE_TILE_WIDTH - TILE_GAP,
  EDGE_TILE_DEPTH - TILE_GAP,
];
const CORNER_TILE_SIZE: readonly [number, number] = [
  CORNER_SIZE - TILE_GAP,
  CORNER_SIZE - TILE_GAP,
];

const sidePosition = (side: Exclude<BoardSide, 'CORNER'>, index: number): readonly [number, number, number] => {
  const offset = INNER_SIDE_BOUNDARY - (index + 0.5) * EDGE_TILE_WIDTH;
  switch (side) {
    case 'BOTTOM':
      return [offset, 0, CORNER_CENTER];
    case 'LEFT':
      return [-CORNER_CENTER, 0, offset];
    case 'TOP':
      return [offset * -1, 0, -CORNER_CENTER];
    case 'RIGHT':
      return [CORNER_CENTER, 0, offset * -1];
  }
};

const createSideLayout = (
  tileId: number,
  side: Exclude<BoardSide, 'CORNER'>,
  index: number,
): BoardTileLayout => ({
  tileId,
  side,
  position: sidePosition(side, index),
  rotation: [0, SIDE_ROTATIONS[side], 0],
  size: SIDE_TILE_SIZE,
});

const createCornerLayout = (
  tileId: number,
  position: readonly [number, number, number],
): BoardTileLayout => ({
  tileId,
  side: 'CORNER',
  position,
  rotation: [0, CORNER_ROTATIONS[tileId] ?? 0, 0],
  size: CORNER_TILE_SIZE,
});

export const boardLayout: readonly BoardTileLayout[] = [
  createCornerLayout(0, [CORNER_CENTER, 0, CORNER_CENTER]),
  ...Array.from({ length: 9 }, (_, index) => createSideLayout(index + 1, 'BOTTOM', index)),
  createCornerLayout(10, [-CORNER_CENTER, 0, CORNER_CENTER]),
  ...Array.from({ length: 9 }, (_, index) => createSideLayout(index + 11, 'LEFT', index)),
  createCornerLayout(20, [-CORNER_CENTER, 0, -CORNER_CENTER]),
  ...Array.from({ length: 9 }, (_, index) => createSideLayout(index + 21, 'TOP', index)),
  createCornerLayout(30, [CORNER_CENTER, 0, -CORNER_CENTER]),
  ...Array.from({ length: 9 }, (_, index) => createSideLayout(index + 31, 'RIGHT', index)),
];

const layoutByTileId = new Map(boardLayout.map(layout => [layout.tileId, layout]));

export function getBoardTileLayout(tileId: number): BoardTileLayout | undefined {
  return layoutByTileId.get(tileId);
}

export const BOARD_BOUNDING_RADIUS = Math.hypot(OUTER_BOARD_SIZE / 2, OUTER_BOARD_SIZE / 2);
