/**
 * Geometry for the HUD overlap checker (plan 03 T03.14). Dev and capture tooling only: it measures how much of each of
 * the 40 tiles (a convex quad on screen) a HUD element covers.
 */
export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TileScreenRect {
  tileId: number;
  /** The four projected surface corners in CSS pixels of the page, in drawing order. */
  corners: readonly [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint];
}

export interface HudRegionRect extends ScreenRect {
  region: string;
}

export interface OverlapFinding {
  region: string;
  tileId: number;
  /** Covered part of the tile, from 0 to 1. */
  coveredShare: number;
  coveredArea: number;
  tileArea: number;
}

/** Area of a simple polygon by the shoelace formula (always positive). */
export function polygonArea(points: readonly ScreenPoint[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

type Edge = (point: ScreenPoint) => number;

/** Clips a polygon against one half plane (`inside(point) >= 0`) with Sutherland-Hodgman. */
function clip(polygon: readonly ScreenPoint[], inside: Edge): ScreenPoint[] {
  const result: ScreenPoint[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const currentValue = inside(current);
    const previousValue = inside(previous);
    if (currentValue >= 0) {
      if (previousValue < 0) result.push(intersect(previous, current, previousValue, currentValue));
      result.push(current);
    } else if (previousValue >= 0) {
      result.push(intersect(previous, current, previousValue, currentValue));
    }
  }
  return result;
}

function intersect(from: ScreenPoint, to: ScreenPoint, fromValue: number, toValue: number): ScreenPoint {
  const t = fromValue / (fromValue - toValue);
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/** Area shared by a convex quad and an axis-aligned rectangle. */
export function quadRectOverlapArea(quad: readonly ScreenPoint[], rect: ScreenRect): number {
  let polygon: ScreenPoint[] = [...quad];
  polygon = clip(polygon, point => point.x - rect.left);
  if (polygon.length === 0) return 0;
  polygon = clip(polygon, point => rect.right - point.x);
  if (polygon.length === 0) return 0;
  polygon = clip(polygon, point => point.y - rect.top);
  if (polygon.length === 0) return 0;
  polygon = clip(polygon, point => rect.bottom - point.y);
  return polygon.length === 0 ? 0 : polygonArea(polygon);
}

/** Tiles a region covers by more than `threshold` of their area (default 4%). */
export function findHudTileOverlaps(
  tiles: readonly TileScreenRect[],
  regions: readonly HudRegionRect[],
  threshold = 0.04,
): OverlapFinding[] {
  const findings: OverlapFinding[] = [];
  for (const region of regions) {
    for (const tile of tiles) {
      const tileArea = polygonArea(tile.corners);
      if (tileArea <= 0) continue;
      const coveredArea = quadRectOverlapArea(tile.corners, region);
      const coveredShare = coveredArea / tileArea;
      if (coveredShare > threshold) {
        findings.push({ region: region.region, tileId: tile.tileId, coveredShare, coveredArea, tileArea });
      }
    }
  }
  return findings.sort((left, right) => right.coveredShare - left.coveredShare);
}

export interface PropScreenRect {
  id: string;
  rect: ScreenRect;
}

export interface PropOverlapFinding {
  region: string;
  propId: string;
  /** Covered part of the prop's rectangle, from 0 to 1. */
  coveredShare: number;
  coveredArea: number;
  propArea: number;
}

export interface PropTileOverlapFinding {
  propId: string;
  tileId: number;
  /** Part of the tile's surface the prop's rectangle covers, from 0 to 1. */
  coveredShare: number;
}

/** Area shared by two axis-aligned rectangles. */
export function rectOverlapArea(first: ScreenRect, second: ScreenRect): number {
  const width = Math.min(first.right, second.right) - Math.max(first.left, second.left);
  const height = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
  return width > 0 && height > 0 ? width * height : 0;
}

/** HUD regions that cover more than `threshold` (default 2%) of a table prop's rectangle (plan 05 T05.8), worst first. */
export function findHudPropOverlaps(
  props: readonly PropScreenRect[],
  regions: readonly HudRegionRect[],
  threshold = 0.02,
): PropOverlapFinding[] {
  const findings: PropOverlapFinding[] = [];
  for (const region of regions) {
    for (const prop of props) {
      const propArea = (prop.rect.right - prop.rect.left) * (prop.rect.bottom - prop.rect.top);
      if (propArea <= 0) continue;
      const coveredArea = rectOverlapArea(prop.rect, region);
      const coveredShare = coveredArea / propArea;
      if (coveredShare > threshold) findings.push({ region: region.region, propId: prop.id, coveredShare, coveredArea, propArea });
    }
  }
  return findings.sort((left, right) => right.coveredShare - left.coveredShare);
}

/** Tiles whose surface a table prop's rectangle covers by more than `threshold` (default 0.5%), worst first. */
export function findPropTileOverlaps(
  props: readonly PropScreenRect[],
  tiles: readonly TileScreenRect[],
  threshold = 0.005,
): PropTileOverlapFinding[] {
  const findings: PropTileOverlapFinding[] = [];
  for (const prop of props) {
    for (const tile of tiles) {
      const tileArea = polygonArea(tile.corners);
      if (tileArea <= 0) continue;
      const coveredShare = quadRectOverlapArea(tile.corners, prop.rect) / tileArea;
      if (coveredShare > threshold) findings.push({ propId: prop.id, tileId: tile.tileId, coveredShare });
    }
  }
  return findings.sort((left, right) => right.coveredShare - left.coveredShare);
}
