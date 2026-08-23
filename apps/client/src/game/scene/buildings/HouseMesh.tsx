import { HOUSE_BODY_HEIGHT } from '../board/architecture/boardArtSpec';
import { boardVisualTokens } from '../board/boardVisualTokens';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import ContactShadow from '../fx/ContactShadow';
import { getPlayerAccentDarkColor, getPlayerDisplayColor } from '../../ui/playerVisualColors';

export default function HouseMesh({
  position,
  ownerColor,
}: { position: readonly [number, number, number]; ownerColor?: string }) {
  const wallColor = ownerColor ? getPlayerDisplayColor(ownerColor) : boardVisualTokens.house;
  const roofColor = ownerColor ? getPlayerAccentDarkColor(ownerColor) : boardVisualTokens.houseDark;
  return (
    <group name="HouseVisual" position={position}>
      <RoundedBoxMesh
        name="HouseWall"
        width={0.4}
        height={HOUSE_BODY_HEIGHT}
        depth={0.32}
        radius={0.045}
        color={wallColor}
        materialProfile="houseWall"
      />
      <RoundedBoxMesh
        name="HouseRoof"
        width={0.46}
        height={0.075}
        depth={0.39}
        radius={0.035}
        color={roofColor}
        materialProfile="houseRoof"
        position={[0, HOUSE_BODY_HEIGHT / 2 + 0.035, 0]}
      />
      <ContactShadow scale={[0.48, 0.4]} opacity={0.2} />
    </group>
  );
}
