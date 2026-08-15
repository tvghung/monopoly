import type { Tile } from '@monopoly/shared';
import CardDeckVisual from '../../special/CardDeckVisual';
import JailVisual from '../../special/JailVisual';
import RailroadVisual from '../../special/RailroadVisual';
import SpecialTileVisual from '../../special/SpecialTileVisual';
import UtilityVisual from '../../special/UtilityVisual';

interface TileSpecialLayerProps {
  tile: Tile;
  size: readonly [number, number];
}

export default function TileSpecialLayer({ tile, size }: TileSpecialLayerProps) {
  if (tile.tileType === 'jail') return <JailVisual size={size} />;
  if (tile.tileType === 'chance' || tile.tileType === 'chest') {
    return <CardDeckVisual size={size} kind={tile.tileType} />;
  }
  if (tile.tileType === 'railroad') return <RailroadVisual size={size} />;
  if (tile.tileType === 'company') return <UtilityVisual size={size} label={tile.streetName} />;
  if (tile.tileType !== 'normal') return <SpecialTileVisual size={size} tileType={tile.tileType} />;
  return null;
}
