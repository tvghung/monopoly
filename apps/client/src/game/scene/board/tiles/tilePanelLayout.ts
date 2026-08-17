import { TILE_SURFACE_INSET } from '../boardLayout';
import type { BoardSide } from '../boardLayout';

export const TILE_UPPER_PANEL_RATIO = 0.7;
export const TILE_FOOTER_PANEL_RATIO = 0.3;
export const TILE_DIVIDER_THICKNESS = 0.03;
export const TILE_UPPER_ICON_TOP_INSET_RATIO = 0.06;

export type TilePanelFlowSign = -1 | 1;

export interface TilePanelLayout {
  side: BoardSide;
  flowSign: TilePanelFlowSign;
  contentRotationY: number;
  surfaceSize: readonly [number, number];
  upperSize: readonly [number, number];
  footerSize: readonly [number, number];
  dividerSize: readonly [number, number];
  /** Offset on the pre-tilt plane's local Y axis. Positive points inward. */
  upperPlaneOffset: number;
  footerPlaneOffset: number;
  upperFooterBoundaryPlaneOffset: number;
  dividerPlaneOffset: number;
  /** Offset on the tile-local Z axis used by text and flat art. */
  upperCenterLocalZ: number;
  /** Upper-panel sub-anchor toward the divider for icon-bearing art. */
  upperArtCenterLocalZ: number;
  /** Upper-panel edge away from the lower text region. */
  upperOuterBoundaryLocalZ: number;
  footerCenterLocalZ: number;
  upperFooterBoundaryLocalZ: number;
  dividerLocalZ: number;
}

export function getUsableTileSurfaceSize(
  tileSize: readonly [number, number],
): readonly [number, number] {
  return [
    Math.max(0.3, tileSize[0] - TILE_SURFACE_INSET),
    Math.max(0.3, tileSize[1] - TILE_SURFACE_INSET),
  ];
}

export function getTilePanelLayout(
  surfaceSize: readonly [number, number],
  side: BoardSide = 'BOTTOM',
): TilePanelLayout {
  const width = Math.max(0.3, surfaceSize[0]);
  const depth = Math.max(0.3, surfaceSize[1]);
  const upperDepth = depth * TILE_UPPER_PANEL_RATIO;
  const footerDepth = depth * TILE_FOOTER_PANEL_RATIO;
  const dividerDepth = Math.min(TILE_DIVIDER_THICKNESS, footerDepth * 0.08);
  const flowSign = getTilePanelFlowSign(side);
  const upperPlaneOffset = ((depth - upperDepth) / 2) * flowSign;
  const footerPlaneOffset = (-(depth - footerDepth) / 2) * flowSign;
  const upperBoundary = upperPlaneOffset - flowSign * upperDepth / 2;
  const footerBoundary = footerPlaneOffset + flowSign * footerDepth / 2;
  const upperFooterBoundaryPlaneOffset = (upperBoundary + footerBoundary) / 2;
  const dividerPlaneOffset = upperFooterBoundaryPlaneOffset;
  const upperOuterBoundaryLocalZ = -upperPlaneOffset - flowSign * upperDepth / 2;

  return {
    side,
    flowSign,
    contentRotationY: flowSign === -1 ? Math.PI : 0,
    surfaceSize: [width, depth],
    upperSize: [width, upperDepth],
    footerSize: [width, footerDepth],
    dividerSize: [width, dividerDepth],
    upperPlaneOffset,
    footerPlaneOffset,
    upperFooterBoundaryPlaneOffset,
    dividerPlaneOffset,
    upperCenterLocalZ: -upperPlaneOffset,
    upperArtCenterLocalZ: -upperPlaneOffset + flowSign * upperDepth * 0.16,
    upperOuterBoundaryLocalZ,
    footerCenterLocalZ: -footerPlaneOffset,
    upperFooterBoundaryLocalZ: -upperFooterBoundaryPlaneOffset,
    dividerLocalZ: -dividerPlaneOffset,
  };
}

/**
 * Places a raised icon from the upper region's outer edge, leaving the
 * lower text divider clear without shrinking the icon to fit a centered slot.
 * `towardDividerRatio` is normalized to the upper depth: positive values move
 * toward the divider, while negative values move back toward the outer edge.
 */
export function getUpperIconTopAlignedLocalZ(
  panel: TilePanelLayout,
  iconHeight: number,
  backingScale = 1,
  towardDividerRatio = 0,
): number {
  if (panel.side === 'CORNER') return 0;
  const footprintHeight = Math.max(0, iconHeight) * Math.max(1, backingScale);
  const topInset = panel.upperSize[1] * TILE_UPPER_ICON_TOP_INSET_RATIO;
  const maxTowardDividerOffset = Math.max(
    0,
    panel.upperSize[1] - (topInset * 2) - footprintHeight,
  );
  const requestedOffset = towardDividerRatio * panel.upperSize[1];
  const clampedOffset = Math.min(
    maxTowardDividerOffset,
    Math.max(-topInset, requestedOffset),
  );
  return panel.upperOuterBoundaryLocalZ
    + panel.flowSign * (topInset + footprintHeight / 2 + clampedOffset);
}

export function getOrientedTilePanelLayoutForTileSize(
  tileSize: readonly [number, number],
  side: BoardSide = 'BOTTOM',
): TilePanelLayout {
  return getTilePanelLayout(getUsableTileSurfaceSize(tileSize), side);
}

export function getTilePanelFlowSign(side: BoardSide): TilePanelFlowSign {
  return side === 'LEFT' || side === 'TOP' ? -1 : 1;
}

/**
 * Text stays in the tile's canonical local plane. The anchor yaw then maps
 * this inward top direction to each side, including both runs next to a
 * corner, instead of letting individual tiles choose an outward-facing yaw.
 */
export function getInwardTextTopDirection(
  side: BoardSide,
): readonly [number, number] {
  switch (side) {
    case 'BOTTOM': return [0, -1];
    case 'LEFT': return [1, 0];
    case 'TOP': return [0, 1];
    case 'RIGHT': return [-1, 0];
    case 'CORNER': return [0, 0];
  }
}
