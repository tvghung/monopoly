import { boardVisualTokens } from '../board/boardVisualTokens';
import { HOTEL_BODY_HEIGHT } from '../board/buildingPlacement';

export default function HotelMesh({
  position,
}: { position: readonly [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.52, HOTEL_BODY_HEIGHT, 0.34]} />
        <meshStandardMaterial color={boardVisualTokens.hotel} roughness={0.68} />
      </mesh>
      <mesh position={[0, 0.3, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.3, 0.22, 4]} />
        <meshStandardMaterial color={boardVisualTokens.hotelDark} roughness={0.66} />
      </mesh>
    </group>
  );
}
