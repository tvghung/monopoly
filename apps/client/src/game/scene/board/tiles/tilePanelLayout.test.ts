import { describe, expect, it } from 'vitest';
import {
  TILE_DIVIDER_THICKNESS,
  TILE_FOOTER_PANEL_RATIO,
  TILE_UPPER_PANEL_RATIO,
  getInwardTextTopDirection,
  getTilePanelLayout,
  getTilePanelLayoutForTileSize,
} from './tilePanelLayout';

describe('tile 60/40 panel layout', () => {
  it('creates true upper, footer, and divider regions from one usable surface', () => {
    const layout = getTilePanelLayout([1.35, 2.35]);
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
    const layout = getTilePanelLayoutForTileSize([1.55 - 0.05, 2.4 - 0.05]);
    expect(layout.surfaceSize).toEqual([1.42, 2.27]);
    expect(layout.upperSize[1] + layout.footerSize[1]).toBeCloseTo(layout.surfaceSize[1]);
  });

  it('keeps all edge-side labels on the inward-facing canonical rule', () => {
    expect(getInwardTextTopDirection('BOTTOM')).toEqual([0, -1]);
    expect(getInwardTextTopDirection('LEFT')).toEqual([1, 0]);
    expect(getInwardTextTopDirection('TOP')).toEqual([0, 1]);
    expect(getInwardTextTopDirection('RIGHT')).toEqual([-1, 0]);
  });
});
