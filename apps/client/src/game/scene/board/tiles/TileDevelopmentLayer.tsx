import BuildingLayer from '../../buildings/BuildingLayer';

export default function TileDevelopmentLayer({ houses }: { houses: number }) {
  return (
    <group name="TileDevelopmentLayer">
      {houses > 0 ? <BuildingLayer houses={houses} /> : null}
    </group>
  );
}
