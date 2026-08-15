import { PLATFORM_HEIGHT, TILE_HEIGHT } from './boardLayout';
import { boardVisualTokens } from './boardVisualTokens';

interface SelectionMarkerProps {
  size: readonly [number, number];
  rotation: readonly [number, number, number];
  color?: string;
}

export default function SelectionMarker({
  size, rotation, color = boardVisualTokens.selection,
}: SelectionMarkerProps) {
  const edgeHeight = 0.045;
  const y = PLATFORM_HEIGHT + TILE_HEIGHT + 0.04;
  return (
    <group rotation={rotation}>
      <mesh position={[0, y, -size[1] / 2]}>
        <boxGeometry args={[size[0] + 0.08, edgeHeight, 0.045]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0, y, size[1] / 2]}>
        <boxGeometry args={[size[0] + 0.08, edgeHeight, 0.045]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[-size[0] / 2, y, 0]}>
        <boxGeometry args={[0.045, edgeHeight, size[1]]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[size[0] / 2, y, 0]}>
        <boxGeometry args={[0.045, edgeHeight, size[1]]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}
