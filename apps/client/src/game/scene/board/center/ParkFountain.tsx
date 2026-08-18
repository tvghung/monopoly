import { boardVisualTokens } from '../boardVisualTokens';
import RoundedBoxMesh from '../geometry/RoundedBoxMesh';
import ContactShadow from '../../fx/ContactShadow';

export default function ParkFountain() {
  return (
    <group name="ParkFountain" position={[0, 0.08, 0]}>
      <mesh rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.86, 0.92, 0.14, 24]} />
        <meshStandardMaterial color={boardVisualTokens.plazaFountainRim} roughness={0.76} metalness={0.01} />
      </mesh>
      <mesh position={[0, 0.085, 0]}>
        <cylinderGeometry args={[0.68, 0.68, 0.035, 24]} />
        <meshStandardMaterial color={boardVisualTokens.plazaWater} roughness={0.18} metalness={0.06} />
      </mesh>
      <RoundedBoxMesh
        name="FountainMonument"
        width={0.24}
        height={0.42}
        depth={0.24}
        radius={0.06}
        color={boardVisualTokens.plazaFountainStone}
        materialProfile="centerWell"
        position={[0, 0.3, 0]}
      />
      <mesh position={[0, 0.54, 0]}>
        <sphereGeometry args={[0.13, 16, 10]} />
        <meshStandardMaterial color={boardVisualTokens.plazaWater} roughness={0.12} metalness={0.08} />
      </mesh>
      <ContactShadow scale={[1.8, 1.8]} opacity={0.16} position={[0, -0.006, 0]} />
    </group>
  );
}
