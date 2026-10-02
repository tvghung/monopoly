import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { findPropTileOverlaps, rectOverlapArea } from '../../../dev/hud-overlap/polygonOverlap';
import { projectTileScreenRects } from '../../../dev/hud-overlap/tileScreenRects';
import { BOARD_FIT_HALF_EXTENT } from '../camera/cameraMath';
import { configureOrthographicCamera } from '../camera/FixedBoardCamera';
import {
  PLAYER_STATION_DEPTH,
  PLAYER_STATION_WIDTH,
  PLAYER_STATION_WORLD_ANCHORS,
} from '../stations/stationWorld';
import {
  BOARD_CORNER_REACH,
  TABLE_PROP_EDGE_MARGIN_PX,
  TABLE_PROP_MIN_PX_PER_UNIT,
  TABLE_PROP_PLACEMENTS,
  TABLE_PROP_RIGHT_TAB_BOTTOM,
  getPixelsPerUnit,
  getTablePropPosition,
  getTablePropScreenRect,
  getVisibleTableProps,
  isTablePropVisible,
  projectWorldToCanvas,
  type CanvasSize,
} from './tablePropLayout';

const ALL = ['coffee-phin', 'lotus-bowl', 'non-la', 'play-money'];

/** The standard review viewports, plus a few common desktop sizes between them. */
const VISIBLE_CANVASES: readonly CanvasSize[] = [
  { width: 1920, height: 1080 },
  { width: 1680, height: 1050 },
  { width: 1600, height: 900 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1280, height: 720 },
  { width: 2560, height: 1080 },
];
/** Tablet landscape (the board overflows the width) and the phones (the board is drawn too small). */
const HIDDEN_CANVASES: readonly CanvasSize[] = [
  { width: 1024, height: 768 },
  { width: 812, height: 375 },
  { width: 667, height: 375 },
];

function realCamera({ width, height }: CanvasSize): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera();
  configureOrthographicCamera(camera, width / height);
  camera.updateMatrixWorld(true);
  return camera;
}

/** Distance from `(x, z)` to a rectangle with half extents `(halfX, halfZ)` centered on `(cx, cz)`. */
function distanceToRect(x: number, z: number, cx: number, cz: number, halfX: number, halfZ: number): number {
  return Math.hypot(Math.max(Math.abs(x - cx) - halfX, 0), Math.max(Math.abs(z - cz) - halfZ, 0));
}

describe('table prop projection', () => {
  it.each([...VISIBLE_CANVASES, ...HIDDEN_CANVASES])('matches the real fixed camera at %o', canvas => {
    const camera = realCamera(canvas);
    for (const point of [[0, 0, 0], [-11.75, 0, 9.48], [10.76, 0.6, -10.47], [3, 1, 4]] as const) {
      const analytic = projectWorldToCanvas(point, canvas);
      const projected = new THREE.Vector3(...point).project(camera);
      expect(analytic.x).toBeCloseTo((projected.x * 0.5 + 0.5) * canvas.width, 2);
      expect(analytic.y).toBeCloseTo((-projected.y * 0.5 + 0.5) * canvas.height, 2);
    }
  });

  it('reports the scale of the board: about 36 pixels per world unit at 1280 by 720', () => {
    expect(getPixelsPerUnit({ width: 1280, height: 720 })).toBeCloseTo(36, 0);
    expect(getPixelsPerUnit({ width: 1920, height: 1080 })).toBeCloseTo(54, 0);
  });
});

describe('table prop placement', () => {
  it('puts every prop on the table beside a left or right corner, two on each side', () => {
    expect(TABLE_PROP_PLACEMENTS.filter(placement => placement.side === -1)).toHaveLength(2);
    expect(TABLE_PROP_PLACEMENTS.filter(placement => placement.side === 1)).toHaveLength(2);
    for (const placement of TABLE_PROP_PLACEMENTS) {
      const [x, y, z] = getTablePropPosition(placement);
      expect(y).toBe(0);
      // Along the screen's horizontal axis the prop is beyond the corner of the board.
      const across = Math.abs(x - z) / Math.SQRT2;
      expect(across, placement.id).toBeGreaterThan(BOARD_CORNER_REACH + placement.gap - 0.01);
    }
  });

  it('keeps every prop clear of the board foundation, the player stations and the dice arena', () => {
    for (const placement of TABLE_PROP_PLACEMENTS) {
      const [x, , z] = getTablePropPosition(placement);
      expect(distanceToRect(x, z, 0, 0, BOARD_FIT_HALF_EXTENT, BOARD_FIT_HALF_EXTENT) - placement.radius, `${placement.id} board`)
        .toBeGreaterThanOrEqual(0.15);
      for (const anchor of Object.values(PLAYER_STATION_WORLD_ANCHORS)) {
        const sideways = Math.abs(anchor[0]) > Math.abs(anchor[2]);
        const halfX = sideways ? PLAYER_STATION_DEPTH / 2 : PLAYER_STATION_WIDTH / 2;
        const halfZ = sideways ? PLAYER_STATION_WIDTH / 2 : PLAYER_STATION_DEPTH / 2;
        expect(distanceToRect(x, z, anchor[0], anchor[2], halfX, halfZ) - placement.radius, `${placement.id} station`)
          .toBeGreaterThanOrEqual(0.5);
      }
    }
  });

  it('gives each prop its own space: the envelopes of two props never touch on the table', () => {
    for (const first of TABLE_PROP_PLACEMENTS) {
      for (const second of TABLE_PROP_PLACEMENTS) {
        if (first.id >= second.id) continue;
        const [ax, , az] = getTablePropPosition(first);
        const [bx, , bz] = getTablePropPosition(second);
        expect(Math.hypot(ax - bx, az - bz) - first.radius - second.radius, `${first.id} / ${second.id}`).toBeGreaterThan(0.2);
      }
    }
  });
});

describe('table prop visibility', () => {
  it.each(VISIBLE_CANVASES)('shows all four props at %o', canvas => {
    expect(getVisibleTableProps(canvas).map(placement => placement.id).sort()).toEqual(ALL);
  });

  it.each(HIDDEN_CANVASES)('hides every prop at %o, where the margin is too small', canvas => {
    expect(getVisibleTableProps(canvas)).toEqual([]);
  });

  it('hides everything when the board is drawn smaller than the readable scale, and on an empty canvas', () => {
    const phone = { width: 812, height: 375 };
    expect(getPixelsPerUnit(phone)).toBeLessThan(TABLE_PROP_MIN_PX_PER_UNIT);
    expect(isTablePropVisible(TABLE_PROP_PLACEMENTS[0], { width: 0, height: 0 })).toBe(false);
  });

  it.each(VISIBLE_CANVASES)('keeps shown props inside the margins, in the free band, clear of each other and of the log tab at %o', canvas => {
    const shown = getVisibleTableProps(canvas);
    const rects = shown.map(placement => ({ placement, rect: getTablePropScreenRect(placement, canvas) }));
    for (const { placement, rect } of rects) {
      expect(rect.left, placement.id).toBeGreaterThanOrEqual(TABLE_PROP_EDGE_MARGIN_PX);
      expect(rect.right, placement.id).toBeLessThanOrEqual(canvas.width - TABLE_PROP_EDGE_MARGIN_PX);
      expect(rect.top, placement.id).toBeGreaterThanOrEqual(canvas.height * 0.2);
      expect(rect.bottom, placement.id).toBeLessThanOrEqual(canvas.height * 0.8);
      if (placement.side === 1) expect(rect.top, placement.id).toBeGreaterThanOrEqual(canvas.height * TABLE_PROP_RIGHT_TAB_BOTTOM);
    }
    for (const first of rects) {
      for (const second of rects) {
        if (first.placement.id < second.placement.id) {
          expect(rectOverlapArea(first.rect, second.rect), `${first.placement.id} / ${second.placement.id}`).toBe(0);
        }
      }
    }
  });

  it.each(VISIBLE_CANVASES)('never covers a tile of the board at %o (plan 03 overlap checker)', canvas => {
    const tiles = projectTileScreenRects(realCamera(canvas), { left: 0, top: 0, ...canvas });
    const props = getVisibleTableProps(canvas).map(placement => ({ id: placement.id, rect: getTablePropScreenRect(placement, canvas) }));
    expect(props).toHaveLength(4);
    expect(findPropTileOverlaps(props, tiles, 0)).toEqual([]);
  });
});
