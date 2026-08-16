import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { getOrientedTilePanelLayoutForTileSize } from '../board/tiles/tilePanelLayout';
import HandcuffVisual, { HANDCUFF_ART_FOOTPRINT_RATIO } from './HandcuffVisual';
import ParkingLotVisual, {
  PARKING_ART_WIDTH_RATIO,
  PARKING_CAR_COUNT,
  PARKING_STALL_COUNT,
} from './ParkingLotVisual';
import RailroadVisual, {
  TRAIN_ART_HEIGHT_RATIO,
  TRAIN_ART_WIDTH_RATIO,
  TRAIN_WAGON_COUNT,
} from './RailroadVisual';
import StartSignVisual, {
  START_SIGN_HEIGHT_SCALE,
  START_SIGN_LABEL,
  START_SIGN_TRAVEL_ROTATION_Y,
  START_SIGN_WIDTH_SCALE,
  createStartSignGeometry,
} from './StartSignVisual';
import TaxVisual, { TAX_ART_SAFE_WIDTH_RATIO } from './TaxVisual';
import UtilityVisual, { WATER_ICON_SAFE_WIDTH_RATIO } from './UtilityVisual';
import {
  FLAT_SVG_RENDERING_PIPELINE,
  FLAT_TILE_SVG_ICONS,
  createFlatSvgGeometry,
  getFlatTileSvgArtSize,
} from './FlatTileSvgIcon';

const edgePanel = getOrientedTilePanelLayoutForTileSize([1.55, 2.4], 'BOTTOM');
const cornerPanel = getOrientedTilePanelLayoutForTileSize([2.46, 2.46], 'CORNER');
const svgLoader = new SVGLoader();

describe('Phase 2.5G special visual contracts', () => {
  it('maps railroad, handcuff and utility art to local flat SVG geometry', () => {
    Object.values(FLAT_TILE_SVG_ICONS).forEach(icon => {
      expect(icon.url.startsWith('data:image/svg+xml') || icon.url.endsWith('.svg')).toBe(true);
      expect(icon.url).not.toMatch(/^https?:/);
      expect(icon.source.trimStart()).toMatch(/^<svg\b/);
      expect(icon.safeWidthRatio).toBeGreaterThanOrEqual(0.82);
      expect(icon.safeWidthRatio).toBeLessThanOrEqual(0.9);
      expect(icon.safeHeightRatio).toBeGreaterThanOrEqual(0.55);
      expect(icon.safeHeightRatio).toBeLessThanOrEqual(0.7);
      expect(getFlatTileSvgArtSize(edgePanel, icon)[0]).toBeGreaterThan(0);
      const geometry = createFlatSvgGeometry(svgLoader.parse(icon.source));
      expect(geometry.getAttribute('position')?.count).toBeGreaterThan(0);
      geometry.dispose();
    });

    const handcuffSize = getFlatTileSvgArtSize(cornerPanel, FLAT_TILE_SVG_ICONS['handcuffs-2d']);
    expect(handcuffSize[0] / cornerPanel.surfaceSize[0]).toBeGreaterThanOrEqual(0.8);
    expect(handcuffSize[0] / cornerPanel.surfaceSize[0]).toBeLessThanOrEqual(0.9);
    expect(TRAIN_WAGON_COUNT).toBe(2);
    expect(TRAIN_ART_WIDTH_RATIO).toBeGreaterThanOrEqual(0.82);
    expect(TRAIN_ART_HEIGHT_RATIO).toBeGreaterThanOrEqual(0.55);
    expect(WATER_ICON_SAFE_WIDTH_RATIO).toBeGreaterThanOrEqual(0.82);
    expect(HANDCUFF_ART_FOOTPRINT_RATIO).toBeGreaterThanOrEqual(0.8);
    expect(RailroadVisual).toBeTypeOf('function');
    expect(HandcuffVisual).toBeTypeOf('function');
    expect(UtilityVisual).toBeTypeOf('function');
    expect(FLAT_SVG_RENDERING_PIPELINE).toBe('svg-loader-shape-geometry');
  });

  it('keeps the tax stack, planted start sign and asphalt parking lot contracts', () => {
    const tax = render(<TaxVisual panel={edgePanel} />);
    expect(tax.container.querySelector('[name="TaxVisual"]')).not.toBeNull();
    expect(TAX_ART_SAFE_WIDTH_RATIO).toBeGreaterThanOrEqual(0.8);
    tax.unmount();

    const parking = render(<ParkingLotVisual panel={cornerPanel} />);
    expect(parking.container.querySelector('[name="ParkingLotVisual"]')).not.toBeNull();
    expect(parking.container.querySelector('[name="ParkingAsphalt"]')).not.toBeNull();
    expect(parking.container.querySelector('[name="ParkingGraphic2D"]')).toBeNull();
    expect(PARKING_CAR_COUNT).toBeGreaterThanOrEqual(4);
    expect(PARKING_STALL_COUNT).toBeGreaterThanOrEqual(4);
    expect(PARKING_ART_WIDTH_RATIO).toBeGreaterThanOrEqual(0.75);
    parking.unmount();

    const startGeometry = createStartSignGeometry();
    expect(startGeometry.parameters.options.depth).toBeGreaterThan(0);
    expect(START_SIGN_LABEL).toBe('Start');
    expect(START_SIGN_TRAVEL_ROTATION_Y).toBe(0);
    expect(START_SIGN_WIDTH_SCALE).toBeGreaterThanOrEqual(1.1);
    expect(START_SIGN_HEIGHT_SCALE).toBeGreaterThanOrEqual(1.08);
    startGeometry.dispose();
    expect(StartSignVisual).toBeTypeOf('function');
  });
});
