import {
  HOUSE_BODY_DEPTH,
  HOUSE_BODY_HEIGHT,
  HOUSE_BODY_WIDTH,
  HOUSE_ROOF_DEPTH,
  HOUSE_ROOF_HEIGHT,
  HOUSE_ROOF_WIDTH,
} from '../board/architecture/boardArtSpec';
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
        width={HOUSE_BODY_WIDTH}
        height={HOUSE_BODY_HEIGHT}
        depth={HOUSE_BODY_DEPTH}
        radius={0.045}
        color={wallColor}
        materialProfile="houseWall"
      />
      <RoundedBoxMesh
        name="HouseRoof"
        width={HOUSE_ROOF_WIDTH}
        height={HOUSE_ROOF_HEIGHT}
        depth={HOUSE_ROOF_DEPTH}
        radius={0.035}
        color={roofColor}
        materialProfile="houseRoof"
        position={[0, HOUSE_BODY_HEIGHT / 2 + HOUSE_ROOF_HEIGHT / 2, 0]}
      />
      <ContactShadow scale={[0.58, 0.48]} opacity={0.2} />
    </group>
  );
}
