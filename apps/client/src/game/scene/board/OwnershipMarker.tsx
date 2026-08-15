import { SURFACE_EPSILON, TILE_SURFACE_Y } from './boardLayout';

interface OwnershipMarkerProps {
  color: string;
  size: readonly [number, number];
}

export default function OwnershipMarker({ color, size }: OwnershipMarkerProps) {
  return (
    <mesh
      position={[0, TILE_SURFACE_Y + SURFACE_EPSILON + 0.0325, size[1] / 2 - 0.31]}
      castShadow
    >
      <boxGeometry args={[Math.max(0.55, size[0] * 0.72), 0.065, 0.12]} />
      <meshStandardMaterial color={color} roughness={0.62} metalness={0.05} />
    </mesh>
  );
}
