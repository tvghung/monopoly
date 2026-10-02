import { describe, expect, it } from 'vitest';
import {
  findHudPropOverlaps, findHudTileOverlaps, findPropTileOverlaps, polygonArea, quadRectOverlapArea, rectOverlapArea,
  type TileScreenRect,
} from './polygonOverlap';

const square = (x: number, y: number, size: number) => [
  { x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size },
] as const;

/** A diamond (a rotated square) with the given half diagonal. */
const diamond = (cx: number, cy: number, half: number) => [
  { x: cx, y: cy - half }, { x: cx + half, y: cy }, { x: cx, y: cy + half }, { x: cx - half, y: cy },
] as const;

describe('polygonArea', () => {
  it('measures a square and a diamond', () => {
    expect(polygonArea(square(0, 0, 10))).toBe(100);
    expect(polygonArea(diamond(0, 0, 10))).toBeCloseTo(200);
  });
});

describe('quadRectOverlapArea', () => {
  it('is zero for disjoint shapes and the full area when the rectangle contains the quad', () => {
    expect(quadRectOverlapArea(square(0, 0, 10), { left: 20, top: 20, right: 40, bottom: 40 })).toBe(0);
    expect(quadRectOverlapArea(square(5, 5, 10), { left: 0, top: 0, right: 100, bottom: 100 })).toBe(100);
  });

  it('measures a partial overlap of two squares', () => {
    expect(quadRectOverlapArea(square(0, 0, 10), { left: 5, top: 5, right: 20, bottom: 20 })).toBeCloseTo(25);
  });

  it('clips a rotated quad exactly instead of using its bounding box', () => {
    // The bounding box of the diamond is 20x20 = 400, the diamond itself 200; the right half is 100.
    const area = quadRectOverlapArea(diamond(0, 0, 10), { left: 0, top: -50, right: 50, bottom: 50 });
    expect(area).toBeCloseTo(100);
    // A rectangle in the bounding box corner touches the box but not the diamond.
    expect(quadRectOverlapArea(diamond(0, 0, 10), { left: 6, top: 6, right: 10, bottom: 10 })).toBeCloseTo(0);
  });
});

describe('findHudTileOverlaps', () => {
  const tiles: TileScreenRect[] = [
    { tileId: 1, corners: square(0, 0, 100) },
    { tileId: 2, corners: square(200, 0, 100) },
  ];

  it('reports only tiles covered by more than four percent, worst first', () => {
    const findings = findHudTileOverlaps(tiles, [
      { region: 'status-pill', left: 90, top: 0, right: 250, bottom: 100 },
      { region: 'tiny', left: 96, top: 0, right: 100, bottom: 50 },
    ]);
    expect(findings.map(finding => [finding.region, finding.tileId])).toEqual([
      ['status-pill', 2],
      ['status-pill', 1],
    ]);
    expect(findings[0].coveredShare).toBeCloseTo(0.5);
    expect(findings[1].coveredShare).toBeCloseTo(0.1);
  });

  it('honors a custom threshold and ignores degenerate tiles', () => {
    const strict = findHudTileOverlaps(tiles, [{ region: 'tiny', left: 96, top: 0, right: 100, bottom: 50 }], 0.01);
    expect(strict).toHaveLength(1);
    const flat: TileScreenRect[] = [{ tileId: 9, corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }] }];
    expect(findHudTileOverlaps(flat, [{ region: 'all', left: -5, top: -5, right: 50, bottom: 5 }])).toEqual([]);
  });
});

describe('table prop overlaps (plan 05 T05.8)', () => {
  const props = [
    { id: 'coffee-phin', rect: { left: 0, top: 0, right: 100, bottom: 100 } },
    { id: 'non-la', rect: { left: 300, top: 0, right: 400, bottom: 100 } },
  ];

  it('measures the area two rectangles share', () => {
    expect(rectOverlapArea({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 5, top: 5, right: 20, bottom: 20 })).toBe(25);
    expect(rectOverlapArea({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 10, top: 0, right: 20, bottom: 10 })).toBe(0);
    expect(rectOverlapArea({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 50, top: 50, right: 60, bottom: 60 })).toBe(0);
  });

  it('reports HUD regions that cover more than two percent of a prop, worst first', () => {
    const findings = findHudPropOverlaps(props, [
      { region: 'player-card', left: 50, top: 0, right: 150, bottom: 100 },
      { region: 'sliver', left: 99, top: 0, right: 150, bottom: 100 },
      { region: 'far', left: 500, top: 0, right: 600, bottom: 100 },
    ]);
    expect(findings.map(finding => [finding.region, finding.propId])).toEqual([['player-card', 'coffee-phin']]);
    expect(findings[0].coveredShare).toBeCloseTo(0.5);
    expect(findHudPropOverlaps(props, [{ region: 'sliver', left: 99, top: 0, right: 150, bottom: 100 }], 0.005)).toHaveLength(1);
  });

  it('reports tiles a prop rectangle covers, and ignores a prop clear of every tile', () => {
    const tiles: TileScreenRect[] = [{ tileId: 7, corners: square(50, 50, 100) }, { tileId: 8, corners: square(600, 0, 100) }];
    const findings = findPropTileOverlaps(props, tiles);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ propId: 'coffee-phin', tileId: 7 });
    expect(findings[0].coveredShare).toBeCloseTo(0.25);
    expect(findPropTileOverlaps([props[1]], tiles)).toEqual([]);
  });
});
