import type { Tile } from '@monopoly/shared';
import { getTileVisualDescriptor } from '../architecture/tileVisualRegistry';

interface TileSurfaceLayerProps {
  tile: Tile;
  size: readonly [number, number];
}

export default function TileSurfaceLayer({
  tile,
  size,
}: TileSurfaceLayerProps) {
  const descriptor = getTileVisualDescriptor(tile);
  return (
    <group
      name="TileSurfaceLayer"
      userData={{
        motif: descriptor.motif,
        emblem: descriptor.emblem,
        family: descriptor.family,
        batch: 'TileSurfaceBatch',
        sourceSize: size,
      }}
    />
  );
}
