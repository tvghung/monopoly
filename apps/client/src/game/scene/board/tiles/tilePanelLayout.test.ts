import { describe, expect, it } from 'vitest';
import {
  TILE_DIVIDER_THICKNESS,
  TILE_FOOTER_PANEL_RATIO,
  TILE_UPPER_PANEL_RATIO,
  getInwardTextTopDirection,
  getTilePanelLayout,
  getOrientedTilePanelLayoutForTileSize,
} from './tilePanelLayout';

describe('tile 60/40 panel layout', () => {
  it('creates true upper, footer, and divider regions from one usable surface', () => {
    const layout = getTilePanelLayout([1.35, 2.35], 'BOTTOM');
    expect(layout.side).toBe('BOTTOM');
    expect(layout.flowSign).toBe(1);
    expect(layout.contentRotationY).toBe(0);
    expect(layout.upperSize[0]).toBe(1.35);
    expect(layout.upperSize[1] / layout.surfaceSize[1]).toBeCloseTo(TILE_UPPER_PANEL_RATIO);
    expect(layout.footerSize[1] / layout.surfaceSize[1]).toBeCloseTo(TILE_FOOTER_PANEL_RATIO);
    expect(layout.dividerSize[1]).toBeLessThanOrEqual(TILE_DIVIDER_THICKNESS);
    expect(layout.upperPlaneOffset).toBeGreaterThan(0);
    expect(layout.footerPlaneOffset).toBeLessThan(0);
    expect(layout.upperCenterLocalZ).toBeLessThan(0);
    expect(layout.footerCenterLocalZ).toBeGreaterThan(0);
  });

  it('derives the same usable surface footprint as the renderer', () => {
    const layout = getOrientedTilePanelLayoutForTileSize([1.55 - 0.05, 2.4 - 0.05], 'BOTTOM');
    expect(layout.surfaceSize).toEqual([1.42, 2.27]);
    expect(layout.upperSize[1] + layout.footerSize[1]).toBeCloseTo(layout.surfaceSize[1]);
  });

  it('keeps all edge-side labels on the inward-facing canonical rule', () => {
    expect(getInwardTextTopDirection('BOTTOM')).toEqual([0, -1]);
    expect(getInwardTextTopDirection('LEFT')).toEqual([1, 0]);
    expect(getInwardTextTopDirection('TOP')).toEqual([0, 1]);
    expect(getInwardTextTopDirection('RIGHT')).toEqual([-1, 0]);
  });

  it('orients the same 60/40 contract for every board side', () => {
    (['BOTTOM', 'LEFT', 'TOP', 'RIGHT'] as const).forEach(side => {
      const layout = getOrientedTilePanelLayoutForTileSize([1.5, 2.35], side);
      expect(layout.side).toBe(side);
      expect(layout.upperSize[1] / layout.surfaceSize[1]).toBeCloseTo(TILE_UPPER_PANEL_RATIO);
      expect(layout.footerSize[1] / layout.surfaceSize[1]).toBeCloseTo(TILE_FOOTER_PANEL_RATIO);
      const lowerCenter = Math.min(layout.upperCenterLocalZ, layout.footerCenterLocalZ);
      const higherCenter = Math.max(layout.upperCenterLocalZ, layout.footerCenterLocalZ);
      expect(layout.dividerLocalZ).toBeGreaterThan(lowerCenter);
      expect(layout.dividerLocalZ).toBeLessThan(higherCenter);
      expect(layout.contentRotationY).toBe(side === 'LEFT' || side === 'TOP' ? Math.PI : 0);

      const upperBoundary = layout.upperPlaneOffset
        - layout.flowSign * layout.upperSize[1] / 2;
      const footerBoundary = layout.footerPlaneOffset
        + layout.flowSign * layout.footerSize[1] / 2;
      expect(upperBoundary).toBeCloseTo(footerBoundary, 10);
      expect(layout.upperFooterBoundaryPlaneOffset).toBeCloseTo(upperBoundary, 10);
      expect(layout.dividerPlaneOffset).toBeCloseTo(upperBoundary, 10);
      expect(layout.upperFooterBoundaryLocalZ).toBeCloseTo(-upperBoundary, 10);
      expect(layout.dividerLocalZ).toBeCloseTo(-upperBoundary, 10);
    });
  });

  it('reverses the physical panel flow with the same camera-facing rule as content', () => {
    const bottom = getOrientedTilePanelLayoutForTileSize([1.5, 2.35], 'BOTTOM');
    const left = getOrientedTilePanelLayoutForTileSize([1.5, 2.35], 'LEFT');
    const top = getOrientedTilePanelLayoutForTileSize([1.5, 2.35], 'TOP');

    expect(left.upperCenterLocalZ).toBeCloseTo(-bottom.upperCenterLocalZ);
    expect(left.footerCenterLocalZ).toBeCloseTo(-bottom.footerCenterLocalZ);
    expect(top.upperCenterLocalZ).toBeCloseTo(-bottom.upperCenterLocalZ);
    expect(top.footerCenterLocalZ).toBeCloseTo(-bottom.footerCenterLocalZ);
  });
});
