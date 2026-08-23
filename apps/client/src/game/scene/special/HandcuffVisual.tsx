import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';
import RaisedSvgTileIcon from './RaisedSvgTileIcon';
import { BOARD_SVG_TILE_ICON_ASSETS } from './boardIconAssets';

interface HandcuffVisualProps {
  panel: TilePanelLayout;
}

const HANDCUFF_ASSET = BOARD_SVG_TILE_ICON_ASSETS['handcuffs-svg'];
export const HANDCUFF_ART_FOOTPRINT_RATIO = HANDCUFF_ASSET.cornerSafeWidthRatio
  ?? HANDCUFF_ASSET.safeWidthRatio;

export default function HandcuffVisual({ panel }: HandcuffVisualProps) {
  return (
    <RaisedSvgTileIcon
      panel={panel}
      icon={HANDCUFF_ASSET}
      name="HandcuffsRaisedSvgIcon"
    />
  );
}
