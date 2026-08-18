import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';
import RaisedSvgTileIcon from './RaisedSvgTileIcon';
import { BOARD_SVG_TILE_ICON_ASSETS } from './boardIconAssets';

interface HandcuffVisualProps {
  panel: TilePanelLayout;
}

export const HANDCUFF_ART_FOOTPRINT_RATIO = BOARD_SVG_TILE_ICON_ASSETS['handcuffs-svg'].safeWidthRatio;

export default function HandcuffVisual({ panel }: HandcuffVisualProps) {
  return (
    <RaisedSvgTileIcon
      panel={panel}
      icon={BOARD_SVG_TILE_ICON_ASSETS['handcuffs-svg']}
      name="HandcuffsRaisedSvgIcon"
    />
  );
}
