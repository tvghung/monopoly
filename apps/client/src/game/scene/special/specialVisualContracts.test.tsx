import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getOrientedTilePanelLayoutForTileSize } from '../board/tiles/tilePanelLayout';
import HandcuffVisual, { HANDCUFF_ART_FOOTPRINT_RATIO } from './HandcuffVisual';
import ParkingLotVisual, {
  PARKING_ART_WIDTH_RATIO,
  PARKING_CAR_COUNT,
  PARKING_STALL_COUNT,
} from './ParkingLotVisual';
import RailroadVisual, {
  TRAIN_ART_WIDTH_RATIO,
  TRAIN_BOX_PART_COUNT,
  TRAIN_WAGON_COUNT,
} from './RailroadVisual';
import StartSignVisual, {
  START_SIGN_LABEL,
  START_SIGN_TRAVEL_ROTATION_Y,
  createStartSignGeometry,
} from './StartSignVisual';
import TaxVisual, { TAX_ART_SAFE_WIDTH_RATIO } from './TaxVisual';
import UtilityVisual, { WATER_ICON_SAFE_WIDTH_RATIO } from './UtilityVisual';

const edgePanel = getOrientedTilePanelLayoutForTileSize([1.55, 2.4], 'BOTTOM');
const cornerPanel = getOrientedTilePanelLayoutForTileSize([2.46, 2.46], 'CORNER');

describe('Phase 2.5F special visual contracts', () => {
  it('renders the railroad as a locomotive towing two wagons with shared wheels', () => {
    const { container } = render(<RailroadVisual panel={edgePanel} />);
    expect(container.querySelector('[name="TrainConvoy25D"]')).not.toBeNull();
    expect(container.querySelector('[name="TrainBoxParts"]')).not.toBeNull();
    expect(container.querySelector('[name="TrainWheels"]')).not.toBeNull();
    expect(TRAIN_WAGON_COUNT).toBe(2);
    expect(TRAIN_BOX_PART_COUNT).toBe(14);
    expect(TRAIN_ART_WIDTH_RATIO).toBeGreaterThan(0.8);
  });

  it('keeps the water faucet large while retaining the electric art path', () => {
    const { container } = render(<UtilityVisual panel={edgePanel} label="Công Ty Nước" />);
    expect(container.querySelector('[name="WaterFaucetGraphic25D"]')).not.toBeNull();
    expect(container.querySelector('[name="WaterFaucet2D"]')).toBeNull();
    expect(WATER_ICON_SAFE_WIDTH_RATIO).toBeGreaterThanOrEqual(0.8);
  });

  it('uses a large tax stack, planted start sign, asphalt parking lot and handcuffs', () => {
    const tax = render(<TaxVisual panel={edgePanel} />);
    expect(tax.container.querySelector('[name="TaxVisual25D"]')).not.toBeNull();
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

    const handcuffs = render(<HandcuffVisual panel={cornerPanel} />);
    expect(handcuffs.container.querySelector('[name="HandcuffVisual"]')).not.toBeNull();
    expect(handcuffs.container.querySelectorAll('[name="HandcuffRing"]')).toHaveLength(2);
    expect(handcuffs.container.querySelector('[name="PoliceIcon2D"]')).toBeNull();
    expect(HANDCUFF_ART_FOOTPRINT_RATIO).toBeGreaterThanOrEqual(0.8);
    handcuffs.unmount();

    const startGeometry = createStartSignGeometry();
    expect(startGeometry.parameters.options.depth).toBeGreaterThan(0);
    expect(START_SIGN_LABEL).toBe('Start');
    expect(START_SIGN_TRAVEL_ROTATION_Y).toBe(0);
    startGeometry.dispose();
    expect(StartSignVisual).toBeTypeOf('function');
  });
});
