import {
  BOARD_FOUNDATION_HEIGHT,
  CARD_HEIGHT as ART_CARD_HEIGHT,
  JAIL_BASE_HEIGHT as ART_JAIL_BASE_HEIGHT,
  OWNERSHIP_MARKER_HEIGHT as ART_OWNERSHIP_MARKER_HEIGHT,
  SELECTION_EDGE_HEIGHT as ART_SELECTION_EDGE_HEIGHT,
  TILE_BODY_HEIGHT,
  TILE_SOCKET_GAP,
  TILE_SURFACE_EPSILON,
  TILE_SURFACE_INSET as ART_TILE_SURFACE_INSET,
} from './architecture/boardArtSpec';

export type BoardSide = 'BOTTOM' | 'LEFT' | 'TOP' | 'RIGHT' | 'CORNER';

export const CORNER_SIZE = 2.4;
export const EDGE_TILE_WIDTH = 1.4;
export const EDGE_TILE_DEPTH = 2.4;
export const TILE_GAP = 0.05;
export const TILE_HEIGHT = TILE_BODY_HEIGHT;
export const PLATFORM_HEIGHT = BOARD_FOUNDATION_HEIGHT;
export const TILE_SURFACE_Y = PLATFORM_HEIGHT + TILE_SOCKET_GAP + TILE_HEIGHT;
export const TILE_FACE_EPSILON = 0.006;
export const TILE_SURFACE_LOCAL_POSITION: readonly [number, number, number] = [
  0,
  TILE_SURFACE_Y + TILE_FACE_EPSILON,
  0,
];
export const TILE_SURFACE_LOCAL_ROTATION: readonly [number, number, number] = [
  -Math.PI / 2,
  0,
  0,
];
export const TILE_SURFACE_INSET = ART_TILE_SURFACE_INSET;
export const SURFACE_EPSILON = TILE_SURFACE_EPSILON;
export const TILE_SURFACE_CLEARANCE_Y = TILE_SURFACE_Y + SURFACE_EPSILON;

export const OWNERSHIP_MARKER_HEIGHT = ART_OWNERSHIP_MARKER_HEIGHT;
export const OWNERSHIP_MARKER_CENTER_Y = TILE_SURFACE_CLEARANCE_Y + OWNERSHIP_MARKER_HEIGHT / 2;
export const SELECTION_EDGE_HEIGHT = ART_SELECTION_EDGE_HEIGHT;
export const SELECTION_MARKER_CENTER_Y = TILE_SURFACE_CLEARANCE_Y + SELECTION_EDGE_HEIGHT / 2;
export const CARD_HEIGHT = ART_CARD_HEIGHT;
export const JAIL_BASE_HEIGHT = ART_JAIL_BASE_HEIGHT;
export const JAIL_BASE_CENTER_Y = JAIL_BASE_HEIGHT / 2;

export function getGeometryBottomY(centerY: number, height: number): number {
  return centerY - height / 2;
}

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

export interface TileSurfaceGeometry {
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
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

export function getTileSurfaceGeometry(layout: BoardTileLayout): TileSurfaceGeometry {
  return {
    position: TILE_SURFACE_LOCAL_POSITION,
    rotation: TILE_SURFACE_LOCAL_ROTATION,
    size: [
      Math.max(0.3, layout.size[0] - TILE_SURFACE_INSET),
      Math.max(0.3, layout.size[1] - TILE_SURFACE_INSET),
    ],
  };
}

export function transformTileLocalPointToWorld(
  tileId: number,
  localPoint: readonly [number, number, number],
): readonly [number, number, number] | undefined {
  const layout = getBoardTileLayout(tileId);
  if (!layout) return undefined;
  const rotation = layout.rotation[1];
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return [
    layout.position[0] + cos * localPoint[0] + sin * localPoint[2],
    layout.position[1] + localPoint[1],
    layout.position[2] - sin * localPoint[0] + cos * localPoint[2],
  ];
}

export function getTileSurfaceWorldCorners(
  tileId: number,
): readonly (readonly [number, number, number])[] | undefined {
  const layout = getBoardTileLayout(tileId);
  if (!layout) return undefined;
  const surface = getTileSurfaceGeometry(layout);
  const halfWidth = surface.size[0] / 2;
  const halfDepth = surface.size[1] / 2;
  return [
    transformTileLocalPointToWorld(tileId, [-halfWidth, surface.position[1], -halfDepth]),
    transformTileLocalPointToWorld(tileId, [halfWidth, surface.position[1], -halfDepth]),
    transformTileLocalPointToWorld(tileId, [halfWidth, surface.position[1], halfDepth]),
    transformTileLocalPointToWorld(tileId, [-halfWidth, surface.position[1], halfDepth]),
  ] as readonly (readonly [number, number, number])[];
}

export const BOARD_BOUNDING_RADIUS = Math.hypot(OUTER_BOARD_SIZE / 2, OUTER_BOARD_SIZE / 2);
