import { HOUSE_BODY_HEIGHT } from '../board/architecture/boardArtSpec';
import { boardVisualTokens } from '../board/boardVisualTokens';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import ContactShadow from '../fx/ContactShadow';

export default function HouseMesh({
  position,
}: { position: readonly [number, number, number] }) {
  return (
    <group name="HouseVisual" position={position}>
      <RoundedBoxMesh
        name="HouseWall"
        width={0.3}
        height={HOUSE_BODY_HEIGHT}
        depth={0.25}
        radius={0.045}
        color={boardVisualTokens.house}
        materialProfile="houseWall"
      />
      <RoundedBoxMesh
        name="HouseRoof"
        width={0.34}
        height={0.075}
        depth={0.29}
        radius={0.035}
        color={boardVisualTokens.houseDark}
        materialProfile="houseRoof"
        position={[0, HOUSE_BODY_HEIGHT / 2 + 0.035, 0]}
      />
      <ContactShadow scale={[0.36, 0.3]} opacity={0.18} />
    </group>
  );
}
