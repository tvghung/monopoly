import { SELECTION_EDGE_HEIGHT, SELECTION_MARKER_CENTER_Y } from './boardLayout';
import { boardVisualTokens } from './boardVisualTokens';

interface SelectionMarkerProps {
  size: readonly [number, number];
  color?: string;
}

export default function SelectionMarker({
  size, color = boardVisualTokens.selection,
}: SelectionMarkerProps) {
  const edgeHeight = SELECTION_EDGE_HEIGHT;
  const y = SELECTION_MARKER_CENTER_Y;
  return (
    <group>
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
