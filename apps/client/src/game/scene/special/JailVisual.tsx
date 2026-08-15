import { boardVisualTokens } from '../board/boardVisualTokens';
import { JAIL_BASE_CENTER_Y, JAIL_BASE_HEIGHT, TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import ContactShadow from '../fx/ContactShadow';

interface JailVisualProps {
  size: readonly [number, number];
}

export default function JailVisual({ size }: JailVisualProps) {
  const barCount = 4;
  const barSpacing = size[0] / (barCount + 1);
  return (
    <group name="JailVisual" position={[0, TILE_SURFACE_CLEARANCE_Y, 0]}>
      <RoundedBoxMesh width={size[0] * 0.72} height={JAIL_BASE_HEIGHT} depth={size[1] * 0.62} radius={0.05} color={boardVisualTokens.jail} materialProfile="boardEdge" position={[0, JAIL_BASE_CENTER_Y, 0]} />
      {[-1, 1].map(side => (
        <RoundedBoxMesh key={side} width={0.1} height={0.72} depth={0.1} radius={0.035} color={boardVisualTokens.jailBars} materialProfile="metal" position={[side * size[0] * 0.29, 0.42, 0]} />
      ))}
      {Array.from({ length: barCount }, (_, index) => (
        <mesh key={index} position={[(index + 1) * barSpacing - size[0] / 2, 0.42, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.72, 8]} />
          <meshStandardMaterial color={boardVisualTokens.jailBars} roughness={0.24} metalness={0.7} />
        </mesh>
      ))}
      <RoundedBoxMesh width={size[0] * 0.82} height={0.08} depth={0.12} radius={0.03} color={boardVisualTokens.jailBars} materialProfile="metal" position={[0, 0.77, 0]} />
      <ContactShadow scale={[0.7, 0.4]} opacity={0.16} position={[0, -0.008, 0]} />
    </group>
  );
}
