import { boardVisualTokens } from '../board/boardVisualTokens';

export default function HotelMesh({
  position,
}: { position: readonly [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[0.52, 0.46, 0.34]} />
        <meshStandardMaterial color={boardVisualTokens.hotel} roughness={0.68} />
      </mesh>
      <mesh position={[0, 0.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.3, 0.22, 4]} />
        <meshStandardMaterial color="#8e2f39" roughness={0.66} />
      </mesh>
    </group>
  );
}
