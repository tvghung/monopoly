import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';
import RaisedSvgTileIcon from './RaisedSvgTileIcon';
import { BOARD_SVG_TILE_ICON_ASSETS } from './boardIconAssets';

interface RailroadVisualProps {
  panel: TilePanelLayout;
}

export const TRAIN_WAGON_COUNT = 1;
export const TRAIN_ART_WIDTH_RATIO = BOARD_SVG_TILE_ICON_ASSETS['railroad-train-svg'].safeWidthRatio;
export const TRAIN_ART_HEIGHT_RATIO = BOARD_SVG_TILE_ICON_ASSETS['railroad-train-svg'].safeHeightRatio;

export default function RailroadVisual({ panel }: RailroadVisualProps) {
  return (
    <RaisedSvgTileIcon
      panel={panel}
      icon={BOARD_SVG_TILE_ICON_ASSETS['railroad-train-svg']}
      name="RailroadRaisedSvgIcon"
    />
  );
}
