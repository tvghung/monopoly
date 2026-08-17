import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';
import RaisedSvgTileIcon from './RaisedSvgTileIcon';
import { BOARD_SVG_TILE_ICON_ASSETS } from './boardIconAssets';

interface RailroadVisualProps {
  panel: TilePanelLayout;
}

export const TRAIN_WAGON_COUNT = 2;
export const TRAIN_ART_WIDTH_RATIO = 0.86;
export const TRAIN_ART_HEIGHT_RATIO = 0.66;

export default function RailroadVisual({ panel }: RailroadVisualProps) {
  return (
    <RaisedSvgTileIcon
      panel={panel}
      icon={BOARD_SVG_TILE_ICON_ASSETS['railroad-train-svg']}
      name="RailroadRaisedSvgIcon"
    />
  );
}
