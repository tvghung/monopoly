import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';
import RaisedSvgTileIcon from './RaisedSvgTileIcon';
import { BOARD_SVG_TILE_ICON_ASSETS } from './boardIconAssets';
import { getUtilityArtKind } from './specialTileArt';

interface UtilityVisualProps {
  panel: TilePanelLayout;
  label: string;
}

export const WATER_ICON_SAFE_WIDTH_RATIO = 0.86;

export default function UtilityVisual({ panel, label }: UtilityVisualProps) {
  const utilityKind = getUtilityArtKind(label);
  return (
    <RaisedSvgTileIcon
      panel={panel}
      icon={BOARD_SVG_TILE_ICON_ASSETS[utilityKind]}
      name="UtilityRaisedSvgIcon"
    />
  );
}
