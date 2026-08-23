import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  getOrientedTilePanelLayoutForTileSize,
  getUpperIconTopAlignedLocalZ,
} from '../board/tiles/tilePanelLayout';
import {
  TILE_ICON_BACKING_Y_OFFSET,
  TILE_ICON_BACKING_SCALE,
  TILE_ICON_DEPTH,
  TILE_ICON_FACE_Y_OFFSET,
  TILE_SURFACE_EPSILON,
} from '../board/architecture/boardArtSpec';
import { getBoardTileLayout } from '../board/boardLayout';
import HandcuffVisual, { HANDCUFF_ART_FOOTPRINT_RATIO } from './HandcuffVisual';
import CardDeckVisual from './CardDeckVisual';
import JailVisual, { JAIL_CORNER_DEPTH_RATIO, JAIL_CORNER_WIDTH_RATIO } from './JailVisual';
import ParkingLotVisual, {
  PARKING_ART_WIDTH_RATIO,
  PARKING_CAR_COUNT,
  PARKING_CAR_SCALE,
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
  START_SIGN_NATIVE_WIDTH,
  START_SIGN_TRAVEL_ROTATION_Y,
  START_SIGN_WIDTH_SCALE,
  START_SIGN_TARGET_WIDTH_RATIO,
  getStartSignWidthScale,
  createStartSignGeometry,
} from './StartSignVisual';
import TaxVisual, {
  TAX_ART_SAFE_DEPTH_RATIO,
  TAX_ART_SAFE_WIDTH_RATIO,
  TAX_BACK_PAPER_COLOR,
  TAX_PLACEHOLDER_LINE_COUNT,
} from './TaxVisual';
import UtilityVisual, { WATER_ICON_SAFE_WIDTH_RATIO } from './UtilityVisual';
import { BOARD_SVG_TILE_ICON_ASSETS } from './boardIconAssets';
import chanceQuestionSvg from './icons/chance-question.svg?raw';
import electricBulbSvg from './icons/electric-bulb.svg?raw';
import fortuneWheelSvg from './icons/fortune-wheel.svg?raw';
import handcuffsSvg from './icons/handcuffs.svg?raw';
import railroadTrainSvg from './icons/railroad-train.svg?raw';
import waterFaucetSvg from './icons/water-faucet.svg?raw';
import {
  RAISED_SVG_BACKING_RENDER_ORDER,
  RAISED_SVG_FACE_RENDER_ORDER,
  RAISED_SVG_RENDERING_PIPELINE,
  getRaisedSvgTileIconArtSize,
} from './RaisedSvgTileIcon';

const edgePanel = getOrientedTilePanelLayoutForTileSize(getBoardTileLayout(1)!.size, 'BOTTOM');
const cornerPanel = getOrientedTilePanelLayoutForTileSize(getBoardTileLayout(0)!.size, 'CORNER');

describe('Phase 2.5G special visual contracts', () => {
  it('maps all approved special art to local SVG texture assets', () => {
    Object.values(BOARD_SVG_TILE_ICON_ASSETS).forEach(icon => {
      expect(icon.url.startsWith('data:image/svg+xml') || icon.url.endsWith('.svg')).toBe(true);
      expect(icon.url).not.toMatch(/^https?:/);
      expect(icon.viewBoxWidth).toBe(512);
      expect(icon.viewBoxHeight).toBe(512);
      expect(icon.safeWidthRatio).toBeGreaterThan(0.5);
      expect(icon.safeWidthRatio).toBeLessThanOrEqual(0.9);
      expect(icon.safeHeightRatio).toBeGreaterThan(0.5);
      expect(icon.safeHeightRatio).toBeLessThanOrEqual(0.8);
      expect(getRaisedSvgTileIconArtSize(edgePanel, icon)[0]).toBeGreaterThan(0);
    });

    const handcuffSize = getRaisedSvgTileIconArtSize(
      cornerPanel,
      BOARD_SVG_TILE_ICON_ASSETS['handcuffs-svg'],
    );
    expect(handcuffSize[0] / cornerPanel.surfaceSize[0]).toBeGreaterThanOrEqual(0.75);
    expect(handcuffSize[0] / cornerPanel.surfaceSize[0]).toBeLessThanOrEqual(0.9);
    expect(TRAIN_WAGON_COUNT).toBe(1);
    expect(TRAIN_ART_WIDTH_RATIO).toBeGreaterThanOrEqual(0.8);
    expect(TRAIN_ART_HEIGHT_RATIO).toBeGreaterThanOrEqual(0.7);
    expect(WATER_ICON_SAFE_WIDTH_RATIO).toBeGreaterThanOrEqual(0.8);
    expect(HANDCUFF_ART_FOOTPRINT_RATIO).toBeCloseTo(0.89);
    expect(BOARD_SVG_TILE_ICON_ASSETS['chance-question-svg'].safeWidthRatio)
      .toBeGreaterThan(0.72);
    expect(BOARD_SVG_TILE_ICON_ASSETS['fortune-wheel-svg'].safeWidthRatio)
      .toBeGreaterThan(0.72);
    expect(BOARD_SVG_TILE_ICON_ASSETS['chance-question-svg'].verticalBias)
      .toBeGreaterThan(0);
    expect(BOARD_SVG_TILE_ICON_ASSETS['fortune-wheel-svg'].verticalBias)
      .toBeGreaterThan(0);
    expect(BOARD_SVG_TILE_ICON_ASSETS['water-faucet-svg'].verticalBias)
      .toBeGreaterThan(0);
    expect(BOARD_SVG_TILE_ICON_ASSETS['railroad-train-svg'].verticalBias).toBe(0);
    expect(RailroadVisual).toBeTypeOf('function');
    expect(HandcuffVisual).toBeTypeOf('function');
    expect(UtilityVisual).toBeTypeOf('function');
    expect(RAISED_SVG_RENDERING_PIPELINE).toBe('local-svg-texture-with-shallow-backing');
    expect(RAISED_SVG_BACKING_RENDER_ORDER).toBeLessThan(RAISED_SVG_FACE_RENDER_ORDER);
  });

  it('keeps every approved SVG as a real local source file', () => {
    [
      railroadTrainSvg,
      handcuffsSvg,
      waterFaucetSvg,
      electricBulbSvg,
      chanceQuestionSvg,
      fortuneWheelSvg,
    ].forEach(source => expect(source.trimStart()).toMatch(/^<svg\b/));
    expect(fortuneWheelSvg).toContain('clipPath');
    expect(electricBulbSvg).toContain('stroke="white"');
    expect(electricBulbSvg).not.toMatch(/transform="rotate/);
    expect(electricBulbSvg).not.toContain('width="28" height="74"');
    expect(waterFaucetSvg).toContain('M432 386');
    expect(waterFaucetSvg).not.toContain('transform=');
    expect(handcuffsSvg).toContain('fill="white" stroke="#111111"');
    expect(handcuffsSvg).toContain('stroke-width="18"');
    expect(handcuffsSvg).toContain('cx="112" cy="145"');
    expect(handcuffsSvg).toContain('cx="400" cy="145"');
    expect((handcuffsSvg.match(/<rect[^>]+transform="rotate/g) ?? []).length).toBe(5);
    expect(railroadTrainSvg).toContain('<!-- single small wagon -->');
    expect((railroadTrainSvg.match(/<circle cx=/g) ?? []).length).toBe(8);
  });

  it('places every raised SVG footprint in the upper zone, away from lower text', () => {
    Object.values(BOARD_SVG_TILE_ICON_ASSETS).forEach(icon => {
      const [, height] = getRaisedSvgTileIconArtSize(edgePanel, icon);
      const iconCenter = getUpperIconTopAlignedLocalZ(
        edgePanel,
        height,
        TILE_ICON_BACKING_SCALE,
        icon.verticalBias,
      );
      const footprintHeight = height * TILE_ICON_BACKING_SCALE;
      const dividerGap = edgePanel.flowSign
        * (edgePanel.dividerLocalZ - iconCenter)
        - footprintHeight / 2;

      expect(dividerGap).toBeGreaterThan(edgePanel.upperSize[1] * 0.1);
      expect(iconCenter).not.toBeCloseTo(edgePanel.upperArtCenterLocalZ, 2);
    });
  });

  it('keeps the tax stack, planted start sign and asphalt parking lot contracts', () => {
    const tax = render(<TaxVisual panel={edgePanel} />);
    expect(tax.container.querySelector('[name="TaxVisual"]')).not.toBeNull();
    expect(tax.container.querySelector('[name="TaxPaperBack"]')).not.toBeNull();
    expect(tax.container.querySelector('[name="TaxPaperFront"]')).not.toBeNull();
    expect(tax.container.querySelectorAll('[name^="TaxPaperMark"]').length)
      .toBe(TAX_PLACEHOLDER_LINE_COUNT);
    expect(TAX_ART_SAFE_WIDTH_RATIO).toBeLessThan(0.8);
    expect(TAX_ART_SAFE_DEPTH_RATIO).toBeLessThan(0.6);
    expect(TAX_BACK_PAPER_COLOR).toBe('#b7c0be');
    tax.unmount();

    const parking = render(<ParkingLotVisual panel={cornerPanel} />);
    expect(parking.container.querySelector('[name="ParkingLotVisual"]')).not.toBeNull();
    expect(parking.container.querySelector('[name="ParkingAsphalt"]')).not.toBeNull();
    expect(parking.container.querySelector('[name="ParkingGraphic2D"]')).toBeNull();
    expect(PARKING_CAR_COUNT).toBeGreaterThanOrEqual(4);
    expect(PARKING_STALL_COUNT).toBeGreaterThanOrEqual(4);
    expect(PARKING_ART_WIDTH_RATIO).toBeGreaterThanOrEqual(0.75);
    expect(PARKING_CAR_SCALE).toBeCloseTo(1.18);
    parking.unmount();

    const jail = render(<JailVisual panel={cornerPanel} />);
    expect(jail.container.querySelector('[name="JailCellBars2D"]')).not.toBeNull();
    expect(JAIL_CORNER_WIDTH_RATIO).toBeGreaterThanOrEqual(0.7);
    expect(JAIL_CORNER_WIDTH_RATIO).toBeLessThanOrEqual(0.75);
    expect(JAIL_CORNER_DEPTH_RATIO).toBeGreaterThanOrEqual(0.65);
    jail.unmount();

    const startGeometry = createStartSignGeometry();
    expect(startGeometry.parameters.options.depth).toBeGreaterThan(0);
    expect(START_SIGN_LABEL).toBe('Start');
    expect(START_SIGN_TRAVEL_ROTATION_Y).toBe(0);
    expect(START_SIGN_WIDTH_SCALE).toBeGreaterThan(1.25);
    expect(START_SIGN_HEIGHT_SCALE).toBeGreaterThanOrEqual(1.16);
    expect(getStartSignWidthScale(cornerPanel)).toBeCloseTo(START_SIGN_WIDTH_SCALE);
    expect((START_SIGN_NATIVE_WIDTH * START_SIGN_WIDTH_SCALE) / cornerPanel.surfaceSize[0])
      .toBeCloseTo(START_SIGN_TARGET_WIDTH_RATIO);
    startGeometry.dispose();
    expect(StartSignVisual).toBeTypeOf('function');
  });

  it('routes railroad, handcuffs and utilities through the shared raised component', () => {
    const railroad = render(<RailroadVisual panel={edgePanel} />);
    expect(railroad.container.querySelector('[name="RailroadRaisedSvgIcon"]')).not.toBeNull();
    railroad.unmount();

    const handcuffs = render(<HandcuffVisual panel={cornerPanel} />);
    expect(handcuffs.container.querySelector('[name="HandcuffsRaisedSvgIcon"]')).not.toBeNull();
    handcuffs.unmount();

    const utility = render(<UtilityVisual panel={edgePanel} label="Công Ty Nước" />);
    expect(utility.container.querySelector('[name="UtilityRaisedSvgIcon"]')).not.toBeNull();
    utility.unmount();
  });

  it('routes Chance and Fortune through the approved SVG assets', () => {
    const chance = render(<CardDeckVisual panel={edgePanel} kind="chance" />);
    expect(chance.container.querySelector('[name="ChanceQuestionRaisedSvgIcon"]')).not.toBeNull();
    chance.unmount();

    const fortune = render(<CardDeckVisual panel={cornerPanel} kind="chest" />);
    expect(fortune.container.querySelector('[name="FortuneWheelRaisedSvgIcon"]')).not.toBeNull();
    fortune.unmount();
  });

  it('keeps the shared icon layers above the tile surface without a coplanar face', () => {
    expect(TILE_ICON_DEPTH).toBeGreaterThanOrEqual(0.01);
    expect(TILE_ICON_DEPTH).toBeLessThanOrEqual(0.03);
    expect(TILE_ICON_BACKING_Y_OFFSET).toBeGreaterThan(TILE_SURFACE_EPSILON);
    expect(TILE_ICON_FACE_Y_OFFSET - TILE_ICON_BACKING_Y_OFFSET).toBeCloseTo(TILE_ICON_DEPTH);
  });
});
