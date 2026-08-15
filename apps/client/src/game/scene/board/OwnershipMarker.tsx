import {
  OWNERSHIP_MARKER_CENTER_Y,
  OWNERSHIP_MARKER_HEIGHT,
} from './boardLayout';
import { getPlayerDisplayColor } from '../../ui/playerVisualColors';

interface OwnershipMarkerProps {
  color: string;
  size: readonly [number, number];
}

export default function OwnershipMarker({ color, size }: OwnershipMarkerProps) {
  const displayColor = getPlayerDisplayColor(color);
  return (
    <mesh
      position={[0, OWNERSHIP_MARKER_CENTER_Y, size[1] / 2 - 0.31]}
      castShadow
    >
      <boxGeometry args={[Math.max(0.55, size[0] * 0.72), OWNERSHIP_MARKER_HEIGHT, 0.12]} />
      <meshStandardMaterial color={displayColor} roughness={0.62} metalness={0.05} />
    </mesh>
  );
}
