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
      {[-0.16, 0, 0.16].map(x => (
        <RoundedBoxMesh
          key={x}
          name="HotelWindow"
          width={0.075}
          height={0.1}
          depth={0.018}
          radius={0.012}
          color={boardVisualTokens.hotelWindow}
          materialProfile="propertyTrim"
          position={[x, 0.04, 0.2]}
        />
      ))}
      <RoundedBoxMesh
        name="HotelEntrance"
        width={0.11}
        height={0.18}
        depth={0.018}
        radius={0.015}
        color={boardVisualTokens.hotelEntrance}
        materialProfile="propertyTrim"
        position={[0, -0.12, 0.2]}
      />
      <ContactShadow scale={[0.68, 0.38]} opacity={0.18} />
    </group>
  );
}
