import { boardVisualTokens } from '../board/boardVisualTokens';
import { HOUSE_BODY_HEIGHT } from '../board/buildingPlacement';

export default function HouseMesh({
  position,
}: { position: readonly [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.24, HOUSE_BODY_HEIGHT, 0.22]} />
        <meshStandardMaterial color={boardVisualTokens.house} roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.16, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.19, 0.16, 4]} />
        <meshStandardMaterial color={boardVisualTokens.houseDark} roughness={0.7} />
      </mesh>
    </group>
  );
}
