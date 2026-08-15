import type { Tile } from '@monopoly/shared';
import { getDistrictSurfaceDescriptor } from '../architecture/tileVisualRegistry';

interface TileSurfaceLayerProps {
  tile: Tile;
  size: readonly [number, number];
}

export default function TileSurfaceLayer({
  tile,
  size,
}: TileSurfaceLayerProps) {
  const descriptor = getDistrictSurfaceDescriptor(tile);
  return (
    <group
      name="TileSurfaceLayer"
      userData={{
        districtSurfaceKey: descriptor?.surfaceKey ?? null,
        districtAccent: descriptor?.accentColor ?? null,
        batch: 'TileSurfaceBatch',
        sourceSize: size,
      }}
    />
  );
}
