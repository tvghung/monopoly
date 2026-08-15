import type { Tile } from '@monopoly/shared';
import { formatMoney } from '../../../../presentation';
import { TILE_SURFACE_INSET } from '../boardLayout';
import {
  PROPERTY_NAME_Y,
} from '../architecture/boardArtSpec';
import { getTileVisualDescriptor } from '../architecture/tileVisualRegistry';
import SdfSurfaceText, { limitSurfaceTextLines } from './SdfSurfaceText';

interface TileTextLayerProps {
  tile: Tile;
  name: string;
  size: readonly [number, number];
}

export default function TileTextLayer({ tile, name, size }: TileTextLayerProps) {
  const descriptor = getTileVisualDescriptor(tile);
  const surfaceWidth = Math.max(0.3, size[0] - TILE_SURFACE_INSET);
  const cornerScale = Math.min(size[0], size[1]) > 2 ? 1.2 : 1;
  const maxWordsPerLine = Math.max(2, Math.floor(surfaceWidth / 0.34));
  const labelValue = tile.tileType === 'normal'
    ? limitSurfaceTextLines(name, typeof tile.price === 'number' ? 2 : 3, maxWordsPerLine)
    : limitSurfaceTextLines(`${descriptor.label}\n${name}`, typeof tile.price === 'number' ? 2 : 3, maxWordsPerLine);
  const textValue = typeof tile.price === 'number'
    ? `${labelValue}\n${formatMoney(tile.price)}`
    : labelValue;
  return (
    <group name="TileTextLayer">
      <SdfSurfaceText
        name="TileNameText"
        value={textValue}
        position={[0, PROPERTY_NAME_Y, tile.tileType === 'normal' ? 0 : 0.04]}
        fontSize={(tile.tileType === 'normal' ? 0.13 : 0.105) * cornerScale}
        maxWidth={surfaceWidth * 0.84}
        lineHeight={1.02}
      />
    </group>
  );
}
