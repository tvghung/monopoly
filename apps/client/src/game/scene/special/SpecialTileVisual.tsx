import type { TileType } from '@monopoly/shared';
import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';
import HandcuffVisual from './HandcuffVisual';
import ParkingLotVisual from './ParkingLotVisual';
import StartSignVisual from './StartSignVisual';
import TaxVisual from './TaxVisual';

interface SpecialTileVisualProps {
  panel: TilePanelLayout;
  tileType: TileType;
}

export default function SpecialTileVisual({ panel, tileType }: SpecialTileVisualProps) {
  if (tileType === 'start') return <StartSignVisual panel={panel} />;
  if (tileType === 'gojail') return <HandcuffVisual panel={panel} />;
  if (tileType === 'parking') return <ParkingLotVisual panel={panel} />;
  if (tileType === 'expense') return <TaxVisual panel={panel} />;
  return null;
}
