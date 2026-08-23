import {
  HOTEL_BODY_DEPTH,
  HOTEL_BODY_HEIGHT,
  HOTEL_BODY_WIDTH,
  HOTEL_CROWN_DEPTH,
  HOTEL_CROWN_HEIGHT,
  HOTEL_CROWN_WIDTH,
} from '../board/architecture/boardArtSpec';
import { boardVisualTokens } from '../board/boardVisualTokens';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import ContactShadow from '../fx/ContactShadow';
import { getPlayerAccentDarkColor, getPlayerDisplayColor } from '../../ui/playerVisualColors';

export default function HotelMesh({
  position,
  ownerColor,
}: { position: readonly [number, number, number]; ownerColor?: string }) {
  const facadeColor = ownerColor ? getPlayerDisplayColor(ownerColor) : boardVisualTokens.hotel;
  const crownColor = ownerColor ? getPlayerAccentDarkColor(ownerColor) : boardVisualTokens.hotelDark;
  return (
    <group name="HotelVisual" position={position}>
      <RoundedBoxMesh
        name="HotelFacade"
        width={HOTEL_BODY_WIDTH}
        height={HOTEL_BODY_HEIGHT}
        depth={HOTEL_BODY_DEPTH}
        radius={0.06}
        color={facadeColor}
        materialProfile="hotel"
      />
      <RoundedBoxMesh
        name="HotelCrown"
        width={HOTEL_CROWN_WIDTH}
        height={HOTEL_CROWN_HEIGHT}
        depth={HOTEL_CROWN_DEPTH}
        radius={0.04}
        color={crownColor}
        materialProfile="houseRoof"
        position={[0, HOTEL_BODY_HEIGHT / 2 + HOTEL_CROWN_HEIGHT / 2, 0]}
      />
      <ContactShadow scale={[1.1, 0.64]} opacity={0.2} />
    </group>
  );
}
