import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import ContactShadow from '../fx/ContactShadow';

interface UtilityVisualProps {
  size: readonly [number, number];
  label: string;
}

export default function UtilityVisual({ size, label }: UtilityVisualProps) {
  const isWater = label.toLowerCase().includes('nước');
  return (
    <group name="UtilityVisual" position={[0, TILE_SURFACE_CLEARANCE_Y, 0]}>
      <RoundedBoxMesh width={size[0] * 0.42} height={0.12} depth={size[1] * 0.28} radius={0.035} color={boardVisualTokens.utility} materialProfile="propertyTrim" position={[0, 0.08, 0.08]} />
      <mesh position={[0, 0.36, 0.08]}>
        <cylinderGeometry args={[0.18, 0.21, 0.42, 16]} />
        <meshStandardMaterial color={isWater ? boardVisualTokens.utilityWater : boardVisualTokens.utilityMetal} roughness={0.28} metalness={isWater ? 0.05 : 0.4} />
      </mesh>
      <mesh position={[0, 0.6, 0.08]}>
        <cylinderGeometry args={[0.24, 0.24, 0.045, 16]} />
        <meshStandardMaterial color={boardVisualTokens.utilityLight} roughness={0.3} metalness={0.2} />
      </mesh>
      <RoundedBoxMesh width={0.06} height={0.28} depth={0.06} radius={0.02} color={boardVisualTokens.utilityPipe} materialProfile="metal" position={[-0.23, 0.2, 0.08]} />
      <RoundedBoxMesh width={0.06} height={0.28} depth={0.06} radius={0.02} color={boardVisualTokens.utilityPipe} materialProfile="metal" position={[0.23, 0.2, 0.08]} />
      <ContactShadow scale={[0.7, 0.42]} opacity={0.16} position={[0, -0.008, 0.08]} />
    </group>
  );
}
