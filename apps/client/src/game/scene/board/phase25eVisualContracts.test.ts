import { describe, expect, it } from 'vitest';
import { getBoardTileLayout } from './boardLayout';
import { boardVisualTokens } from './boardVisualTokens';
import { getSpecialTileArtKind } from '../special/specialTileArt';
import {
  AIRPORT_RUNWAY_WIDTH,
  createAirportRunwayLoopShape,
  getAirportRunwayDashSpecs,
} from './center/airportRunwayGeometry';
import {
  WHITE_PEBBLE_VARIANTS,
  generateWhitePebbleTextureData,
} from './materials/whitePebbleSurface';
import { getOrientedTilePanelLayoutForTileSize } from './tiles/tilePanelLayout';

describe('Phase 2.5E visual contracts', () => {
  it('keeps the exact shared divider boundary on all edge sides', () => {
    (['BOTTOM', 'LEFT', 'TOP', 'RIGHT'] as const).forEach(side => {
      const panel = getOrientedTilePanelLayoutForTileSize([1.5, 2.35], side);
      const upperBoundary = panel.upperPlaneOffset
        - panel.flowSign * panel.upperSize[1] / 2;
      const footerBoundary = panel.footerPlaneOffset
        + panel.flowSign * panel.footerSize[1] / 2;
      expect(upperBoundary).toBeCloseTo(footerBoundary, 10);
      expect(panel.dividerPlaneOffset).toBeCloseTo(upperBoundary, 10);
    });
    expect(getBoardTileLayout(19)?.side).toBe('LEFT');
    expect(getBoardTileLayout(21)?.side).toBe('TOP');
  });

  it('keeps Chance vector mapping and white tile pebble variants locked', () => {
    expect(getSpecialTileArtKind('chance')).toBe('question-mark-2d');
    const coverages = WHITE_PEBBLE_VARIANTS.map(variant => (
      generateWhitePebbleTextureData(variant, 64).coverage
    ));
    coverages.forEach(coverage => {
      expect(coverage).toBeGreaterThanOrEqual(0.03);
      expect(coverage).toBeLessThanOrEqual(0.07);
    });
    expect(new Set(coverages).size).toBeGreaterThan(1);
  });

  it('keeps the airport as one open ring with four instanced dash sides', () => {
    const runway = createAirportRunwayLoopShape();
    const dashSides = new Set(getAirportRunwayDashSpecs().map(spec => spec.side));
    expect(runway.holes).toHaveLength(1);
    expect(dashSides).toEqual(new Set(['BOTTOM', 'LEFT', 'TOP', 'RIGHT']));
    expect(AIRPORT_RUNWAY_WIDTH).toBe(0.52);
  });

  it('keeps white reading surfaces and high-chroma structural tokens distinct', () => {
    expect(boardVisualTokens.tileSurface).toBe('#ffffff');
    expect(boardVisualTokens.tileFooter).toBe('#ffffff');
    expect(boardVisualTokens.sceneBackground).toBe('#62ddcc');
    expect(boardVisualTokens.boardBase).toBe('#168c82');
    expect(boardVisualTokens.boardBaseEdge).toBe('#113c49');
    expect(boardVisualTokens.boardAccent).toBe('#00c7b4');
  });
});
