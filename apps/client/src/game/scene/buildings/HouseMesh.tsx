import { boardVisualTokens } from '../board/boardVisualTokens';

export default function HouseMesh({
  position,
}: { position: readonly [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[0.24, 0.22, 0.22]} />
        <meshStandardMaterial color={boardVisualTokens.house} roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.16, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.19, 0.16, 4]} />
        <meshStandardMaterial color="#225f41" roughness={0.7} />
      </mesh>
    </group>
  );
}
