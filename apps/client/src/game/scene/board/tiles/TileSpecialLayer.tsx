import type { Tile } from '@monopoly/shared';
import CardDeckVisual from '../../special/CardDeckVisual';
import JailVisual from '../../special/JailVisual';
import RailroadVisual from '../../special/RailroadVisual';
import SpecialTileVisual from '../../special/SpecialTileVisual';
import UtilityVisual from '../../special/UtilityVisual';
import { getSpecialTileArtKind } from '../../special/specialTileArt';
import type { TilePanelLayout } from './tilePanelLayout';

interface TileSpecialLayerProps {
  tile: Tile;
  panel: TilePanelLayout;
}

export default function TileSpecialLayer({ tile, panel }: TileSpecialLayerProps) {
  if (tile.tileType === 'normal') return null;

  const artKind = getSpecialTileArtKind(tile.tileType, tile.streetName);
  let visual: React.ReactNode;
  if (tile.tileType === 'jail') visual = <JailVisual panel={panel} />;
  else if (tile.tileType === 'chance' || tile.tileType === 'chest') {
    visual = <CardDeckVisual panel={panel} kind={tile.tileType} />;
  } else if (tile.tileType === 'railroad') visual = <RailroadVisual panel={panel} />;
  else if (tile.tileType === 'company') visual = <UtilityVisual panel={panel} label={tile.streetName} />;
  else visual = <SpecialTileVisual panel={panel} tileType={tile.tileType} />;

  return (
    <group name={`TileSpecialArt:${artKind}`} userData={{ artKind }}>
      {visual}
    </group>
  );
}
