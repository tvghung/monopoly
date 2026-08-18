interface TileBodyLayerProps {
  tileId: number;
  size: readonly [number, number];
  color: string;
  selected: boolean;
  hovered: boolean;
}

export default function TileBodyLayer({
  tileId,
  size,
  color,
  selected,
  hovered,
}: TileBodyLayerProps) {
  return (
    <group
      name={`TileBodyLayer:${tileId}`}
      userData={{ tileId, size, color, selected, hovered, batch: 'TileBodyBatch' }}
    />
  );
}
