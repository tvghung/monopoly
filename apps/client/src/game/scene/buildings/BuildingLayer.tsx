import { getBoardTileLayout } from '../board/boardLayout';
import { getBuildingSlots, getHotelSlot } from '../board/buildingPlacement';
import HouseMesh from './HouseMesh';
import HotelMesh from './HotelMesh';

interface BuildingLayerProps {
  tileId: number;
  houses: number;
}

export default function BuildingLayer({ tileId, houses }: BuildingLayerProps) {
  const layout = getBoardTileLayout(tileId);
  if (!layout) return null;
  if (houses === 5) {
    return (
      <group position={layout.position} rotation={layout.rotation}>
        <HotelMesh position={getHotelSlot()} />
      </group>
    );
  }
  const slots = getBuildingSlots(houses);
  return (
    <group position={layout.position} rotation={layout.rotation}>
      {slots.map((position, index) => <HouseMesh key={index} position={position} />)}
    </group>
  );
}
