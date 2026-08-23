import { HOTEL_BODY_HEIGHT } from '../board/architecture/boardArtSpec';
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
        width={0.76}
        height={HOTEL_BODY_HEIGHT}
        depth={0.5}
        radius={0.06}
        color={facadeColor}
        materialProfile="hotel"
      />
      <RoundedBoxMesh
        name="HotelCrown"
        width={0.86}
        height={0.13}
        depth={0.58}
        radius={0.04}
        color={crownColor}
        materialProfile="houseRoof"
        position={[0, HOTEL_BODY_HEIGHT / 2 + 0.065, 0]}
      />
      <ContactShadow scale={[0.92, 0.52]} opacity={0.2} />
    </group>
  );
}
