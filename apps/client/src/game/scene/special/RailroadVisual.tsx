import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';
import FlatTileSvgIcon, { FLAT_TILE_SVG_ICONS } from './FlatTileSvgIcon';

interface RailroadVisualProps {
  panel: TilePanelLayout;
}

export const TRAIN_WAGON_COUNT = 2;
export const TRAIN_ART_WIDTH_RATIO = 0.86;
export const TRAIN_ART_HEIGHT_RATIO = 0.66;

export default function RailroadVisual({ panel }: RailroadVisualProps) {
  return (
    <FlatTileSvgIcon
      panel={panel}
      icon={FLAT_TILE_SVG_ICONS['train-convoy-2d']}
      name="RailroadFlatSvgIcon"
    />
  );
}
