import { HOTEL_BODY_HEIGHT } from '../board/architecture/boardArtSpec';
import { boardVisualTokens } from '../board/boardVisualTokens';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import ContactShadow from '../fx/ContactShadow';

export default function HotelMesh({
  position,
}: { position: readonly [number, number, number] }) {
  return (
    <group name="HotelVisual" position={position}>
      <RoundedBoxMesh
        name="HotelFacade"
        width={0.58}
        height={HOTEL_BODY_HEIGHT}
        depth={0.38}
        radius={0.06}
        color={boardVisualTokens.hotel}
        materialProfile="hotel"
      />
      <RoundedBoxMesh
        name="HotelCrown"
        width={0.66}
        height={0.1}
        depth={0.44}
        radius={0.04}
        color={boardVisualTokens.hotelDark}
        materialProfile="houseRoof"
        position={[0, HOTEL_BODY_HEIGHT / 2 + 0.05, 0]}
      />
      <ContactShadow scale={[0.68, 0.38]} opacity={0.18} />
    </group>
  );
}
