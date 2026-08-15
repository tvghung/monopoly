import { TILE_HEIGHT, PLATFORM_HEIGHT } from './boardLayout';

interface OwnershipMarkerProps {
  color: string;
  size: readonly [number, number];
  rotation: readonly [number, number, number];
}

export default function OwnershipMarker({ color, size, rotation }: OwnershipMarkerProps) {
  return (
    <mesh
      position={[0, PLATFORM_HEIGHT + TILE_HEIGHT + 0.035, size[1] / 2 - 0.31]}
      rotation={rotation}
      castShadow
    >
      <boxGeometry args={[Math.max(0.55, size[0] * 0.72), 0.065, 0.12]} />
      <meshStandardMaterial color={color} roughness={0.62} metalness={0.05} />
    </mesh>
  );
}
