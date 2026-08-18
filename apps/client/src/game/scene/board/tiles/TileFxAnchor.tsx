export default function TileFxAnchor({ tileId }: { tileId: number }) {
  return <group name={`TileFxAnchor:${tileId}`} userData={{ tileId }} />;
}
