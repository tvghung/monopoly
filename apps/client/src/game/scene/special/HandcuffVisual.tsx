import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';
import FlatTileSvgIcon, { FLAT_TILE_SVG_ICONS } from './FlatTileSvgIcon';

interface HandcuffVisualProps {
  panel: TilePanelLayout;
}

export const HANDCUFF_ART_FOOTPRINT_RATIO = 0.86;

export default function HandcuffVisual({ panel }: HandcuffVisualProps) {
  return (
    <FlatTileSvgIcon
      panel={panel}
      icon={FLAT_TILE_SVG_ICONS['handcuffs-2d']}
      name="HandcuffsFlatSvgIcon"
    />
  );
}
