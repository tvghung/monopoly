export default function TileInteractionLayer({ tileId }: { tileId: number }) {
  return <group name={`TileInteractionLayer:${tileId}`} userData={{ tileId }} />;
}
