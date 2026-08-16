import type { Tile } from '@monopoly/shared';
import CardDeckVisual from '../../special/CardDeckVisual';
import JailVisual from '../../special/JailVisual';
import RailroadVisual from '../../special/RailroadVisual';
import SpecialTileVisual from '../../special/SpecialTileVisual';
import UtilityVisual from '../../special/UtilityVisual';
import { getSpecialTileArtKind } from '../../special/specialTileArt';

interface TileSpecialLayerProps {
  tile: Tile;
  size: readonly [number, number];
  isCorner: boolean;
}

export default function TileSpecialLayer({ tile, size, isCorner }: TileSpecialLayerProps) {
  if (tile.tileType === 'normal') return null;

  const artKind = getSpecialTileArtKind(tile.tileType);
  let visual: React.ReactNode;
  if (tile.tileType === 'jail') visual = <JailVisual size={size} isCorner={isCorner} />;
  else if (tile.tileType === 'chance' || tile.tileType === 'chest') {
    visual = <CardDeckVisual size={size} kind={tile.tileType} isCorner={isCorner} />;
  } else if (tile.tileType === 'railroad') visual = <RailroadVisual size={size} isCorner={isCorner} />;
  else if (tile.tileType === 'company') visual = <UtilityVisual size={size} label={tile.streetName} isCorner={isCorner} />;
  else visual = <SpecialTileVisual size={size} tileType={tile.tileType} isCorner={isCorner} />;

  return (
    <group name={`TileSpecialArt:${artKind}`} userData={{ artKind }}>
      {visual}
    </group>
  );
}
