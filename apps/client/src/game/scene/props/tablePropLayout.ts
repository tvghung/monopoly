import { OUTER_BOARD_SIZE } from '../board/boardLayout';
import {
  CAMERA_RIGHT,
  CAMERA_UP,
  ORTHOGRAPHIC_READABILITY_ZOOM,
  calculateOrthographicHalfHeight,
} from '../camera/cameraMath';
import type { TablePropId } from './tablePropGeometry';

/**
 * Where the four table props stand and when they show (plan 05 §8.6). They stand on the oak beside the left and right corners
 * of the board, the only margin of the table that stays free of the HUD at desktop sizes, and are hidden at any canvas size
 * where that margin is too small: they are decoration and are never moved under the HUD to keep them visible.
 */
export interface CanvasSize {
  width: number;
  height: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TablePropPlacement {
  id: TablePropId;
  /** Vietnamese name; the props are decorative and never reach assistive technology, so this is for docs and tests. */
  name: string;
  /** -1 beside the board's left corner on screen, 1 beside its right corner. */
  side: -1 | 1;
  /** Distance of the prop's center from the board corner, along the screen's horizontal axis. */
  gap: number;
  /** Shift along the ground direction that rises on screen; negative stands lower. */
  along: number;
  /** Turn about the vertical axis, so the four do not look stamped. */
  yaw: number;
  /** An envelope around the built geometry (a test keeps the geometry inside it): footprint radius and height. */
  radius: number;
  height: number;
}

export const TABLE_PROP_PLACEMENTS: readonly TablePropPlacement[] = [
  { id: 'coffee-phin', name: 'Cà phê phin', side: -1, gap: 1.35, along: 1.6, yaw: 0.5, radius: 0.6, height: 0.92 },
  { id: 'lotus-bowl', name: 'Bát sen', side: -1, gap: 1.35, along: -1.2, yaw: 0, radius: 0.6, height: 0.95 },
  { id: 'non-la', name: 'Nón lá', side: 1, gap: 1.35, along: -0.2, yaw: 0, radius: 0.65, height: 0.7 },
  { id: 'play-money', name: 'Tiền chơi', side: 1, gap: 1.35, along: -3, yaw: -0.35, radius: 0.65, height: 0.24 },
];

/** A prop is shown only where the board is drawn at least this big (CSS pixels per world unit): a tiny prop is only noise. */
export const TABLE_PROP_MIN_PX_PER_UNIT = 30;
/** Props keep this far from the canvas edge. */
export const TABLE_PROP_EDGE_MARGIN_PX = 12;
/**
 * The strip of the canvas where the HUD leaves the sides of the table free: below the player cards of the top corners and
 * above those of the bottom corners (fractions of the canvas height).
 */
export const TABLE_PROP_BAND = { top: 0.2, bottom: 0.8 } as const;
/** The activity-log tab hugs the right edge down to this fraction of the height; props on the right stand below it. */
export const TABLE_PROP_RIGHT_TAB_BOTTOM = 0.42;

/** Distance from the board center to its left or right corner (the corner of the square outer board, turned 45 degrees). */
export const BOARD_CORNER_REACH = Math.SQRT2 * (OUTER_BOARD_SIZE / 2);

type Vec3 = readonly [number, number, number];

const dot = (left: Vec3, right: Vec3): number => left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

function groundDirection(source: Vec3): readonly [number, number] {
  const length = Math.hypot(source[0], source[2]);
  return [source[0] / length, source[2] / length];
}

/** The screen's horizontal axis and its vertical axis, as directions on the table (y = 0) plane. */
const SCREEN_RIGHT_ON_TABLE = groundDirection(CAMERA_RIGHT);
const SCREEN_UP_ON_TABLE = groundDirection(CAMERA_UP);

/** World position of a prop's footprint center (on the table, y = 0). */
export function getTablePropPosition(placement: TablePropPlacement): Vec3 {
  const distance = BOARD_CORNER_REACH + placement.gap;
  return [
    placement.side * SCREEN_RIGHT_ON_TABLE[0] * distance + SCREEN_UP_ON_TABLE[0] * placement.along,
    0,
    placement.side * SCREEN_RIGHT_ON_TABLE[1] * distance + SCREEN_UP_ON_TABLE[1] * placement.along,
  ];
}

/** CSS pixels per world unit of the fixed orthographic camera on a canvas of this size. */
export function getPixelsPerUnit(canvas: CanvasSize): number {
  const aspect = canvas.width / canvas.height;
  const halfHeight = calculateOrthographicHalfHeight(aspect) / ORTHOGRAPHIC_READABILITY_ZOOM;
  return canvas.height / (2 * halfHeight);
}

/** Projects a world point to canvas pixels exactly as `FixedBoardCamera` does (the camera looks at the origin). */
export function projectWorldToCanvas(point: Vec3, canvas: CanvasSize): { x: number; y: number } {
  const aspect = canvas.width / canvas.height;
  const halfHeight = calculateOrthographicHalfHeight(aspect) / ORTHOGRAPHIC_READABILITY_ZOOM;
  const right = dot(point, CAMERA_RIGHT) / (halfHeight * aspect);
  const up = dot(point, CAMERA_UP) / halfHeight;
  return { x: (right * 0.5 + 0.5) * canvas.width, y: (0.5 - up * 0.5) * canvas.height };
}

const OUTLINE_STEPS = 16;

/** The canvas rectangle a prop covers: its footprint circle on the table and the same circle at its full height. */
export function getTablePropScreenRect(placement: TablePropPlacement, canvas: CanvasSize): ScreenRect {
  const [centerX, , centerZ] = getTablePropPosition(placement);
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const y of [0, placement.height]) {
    for (let step = 0; step < OUTLINE_STEPS; step += 1) {
      const angle = (step / OUTLINE_STEPS) * Math.PI * 2;
      const point = projectWorldToCanvas(
        [centerX + Math.cos(angle) * placement.radius, y, centerZ + Math.sin(angle) * placement.radius],
        canvas,
      );
      left = Math.min(left, point.x);
      right = Math.max(right, point.x);
      top = Math.min(top, point.y);
      bottom = Math.max(bottom, point.y);
    }
  }
  return { left, top, right, bottom };
}

/** True when the prop has room on a canvas of this size: big enough scale, inside the free band, clear of the right tab. */
export function isTablePropVisible(placement: TablePropPlacement, canvas: CanvasSize): boolean {
  if (canvas.width <= 0 || canvas.height <= 0) return false;
  if (getPixelsPerUnit(canvas) < TABLE_PROP_MIN_PX_PER_UNIT) return false;
  const rect = getTablePropScreenRect(placement, canvas);
  if (rect.left < TABLE_PROP_EDGE_MARGIN_PX || rect.right > canvas.width - TABLE_PROP_EDGE_MARGIN_PX) return false;
  if (rect.top < canvas.height * TABLE_PROP_BAND.top || rect.bottom > canvas.height * TABLE_PROP_BAND.bottom) return false;
  return !(placement.side === 1 && rect.top < canvas.height * TABLE_PROP_RIGHT_TAB_BOTTOM);
}

export function getVisibleTableProps(canvas: CanvasSize): readonly TablePropPlacement[] {
  return TABLE_PROP_PLACEMENTS.filter(placement => isTablePropVisible(placement, canvas));
}
