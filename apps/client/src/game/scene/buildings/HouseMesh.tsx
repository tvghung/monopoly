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
      <RoundedBoxMesh
        name="HouseDoor"
        width={0.06}
        height={0.105}
        depth={0.018}
        radius={0.012}
        color={boardVisualTokens.houseDoor}
        materialProfile="propertyTrim"
        position={[0, -0.035, 0.13]}
      />
      <RoundedBoxMesh
        name="HouseWindowLeft"
        width={0.055}
        height={0.055}
        depth={0.016}
        radius={0.01}
        color={boardVisualTokens.houseWindow}
        materialProfile="propertyTrim"
        position={[-0.09, 0.03, 0.13]}
      />
      <RoundedBoxMesh
        name="HouseWindowRight"
        width={0.055}
        height={0.055}
        depth={0.016}
        radius={0.01}
        color={boardVisualTokens.houseWindow}
        materialProfile="propertyTrim"
        position={[0.09, 0.03, 0.13]}
      />
      <ContactShadow scale={[0.36, 0.3]} opacity={0.18} />
    </group>
  );
}
