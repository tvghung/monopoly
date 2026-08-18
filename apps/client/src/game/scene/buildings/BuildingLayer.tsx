import { getBuildingSlots, getHotelSlot } from '../board/architecture/tileAnchors';
import HouseMesh from './HouseMesh';
import HotelMesh from './HotelMesh';

interface BuildingLayerProps {
  houses: number;
}

export default function BuildingLayer({ houses }: BuildingLayerProps) {
  if (houses === 5) {
    return (
      <group>
        <HotelMesh position={getHotelSlot()} />
      </group>
    );
  }
  const slots = getBuildingSlots(houses);
  return (
    <group>
      {slots.map((position, index) => <HouseMesh key={index} position={position} />)}
    </group>
  );
}
