import type { TileType } from '@monopoly/shared';
import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import ContactShadow from '../fx/ContactShadow';

interface SpecialTileVisualProps {
  size: readonly [number, number];
  tileType: TileType;
}

export default function SpecialTileVisual({ size, tileType }: SpecialTileVisualProps) {
  if (tileType === 'start') {
    return (
      <group name="StartVisual" position={[0, TILE_SURFACE_CLEARANCE_Y, 0]}>
        <mesh position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 4]}>
          <coneGeometry args={[0.18, 0.34, 4]} />
          <meshStandardMaterial color={boardVisualTokens.selection} roughness={0.3} metalness={0.05} />
        </mesh>
        <RoundedBoxMesh width={0.42} height={0.05} depth={0.09} radius={0.025} color={boardVisualTokens.selection} materialProfile="propertyTrim" position={[0, 0.035, 0]} />
        <ContactShadow scale={[0.54, 0.28]} opacity={0.18} />
      </group>
    );
  }
  if (tileType === 'gojail') {
    return (
      <group name="GoToJailVisual" position={[0, TILE_SURFACE_CLEARANCE_Y, 0]}>
        <RoundedBoxMesh width={size[0] * 0.56} height={0.12} depth={size[1] * 0.26} radius={0.035} color={boardVisualTokens.expense} materialProfile="boardEdge" position={[0, 0.08, 0]} />
        {[[-0.2, 0], [0.2, 0]].map(([x, z]) => <RoundedBoxMesh key={`${x}:${z}`} width={0.06} height={0.38} depth={0.06} radius={0.02} color={boardVisualTokens.expenseDark} materialProfile="propertyTrim" position={[x, 0.31, z]} />)}
        <RoundedBoxMesh width={0.5} height={0.06} depth={0.08} radius={0.025} color={boardVisualTokens.expenseDark} materialProfile="propertyTrim" position={[0, 0.52, 0]} />
        <ContactShadow scale={[0.6, 0.36]} opacity={0.17} />
      </group>
    );
  }
  if (tileType === 'parking') {
    return (
      <group name="ParkingVisual" position={[0, TILE_SURFACE_CLEARANCE_Y, 0]}>
        <RoundedBoxMesh width={0.58} height={0.08} depth={0.34} radius={0.08} color={boardVisualTokens.parkingCar} materialProfile="propertyTrim" position={[0, 0.08, 0.02]} />
        <RoundedBoxMesh width={0.3} height={0.1} depth={0.26} radius={0.06} color={boardVisualTokens.parkingGlass} materialProfile="tileTop" position={[0, 0.16, 0.02]} />
        <ContactShadow scale={[0.72, 0.38]} opacity={0.15} />
      </group>
    );
  }
  return (
    <group name="ExpenseVisual" position={[0, TILE_SURFACE_CLEARANCE_Y, 0]}>
      <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.18, 0.045, 10, 20]} />
        <meshStandardMaterial color={boardVisualTokens.expense} roughness={0.3} metalness={0.12} />
      </mesh>
      <ContactShadow scale={[0.58, 0.34]} opacity={0.15} />
    </group>
  );
}
