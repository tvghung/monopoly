import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';
import FlatTileSvgIcon, { FLAT_TILE_SVG_ICONS } from './FlatTileSvgIcon';
import { getUtilityArtKind } from './specialTileArt';

interface UtilityVisualProps {
  panel: TilePanelLayout;
  label: string;
}

export const WATER_ICON_SAFE_WIDTH_RATIO = 0.86;

export default function UtilityVisual({ panel, label }: UtilityVisualProps) {
  const utilityKind = getUtilityArtKind(label);
  return (
    <FlatTileSvgIcon
      panel={panel}
      icon={FLAT_TILE_SVG_ICONS[utilityKind]}
      name="UtilityFlatSvgIcon"
    />
  );
}
