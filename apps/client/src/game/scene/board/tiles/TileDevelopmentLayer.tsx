import BuildingLayer from '../../buildings/BuildingLayer';
import type { DevelopmentChangeSignal } from '../../../presentation/store/types';

export default function TileDevelopmentLayer({
  houses,
  developmentChange,
}: {
  houses: number;
  developmentChange?: DevelopmentChangeSignal;
}) {
  return (
    <group name="TileDevelopmentLayer">
      {houses > 0
        ? <BuildingLayer houses={houses} developmentChange={developmentChange} />
        : null}
    </group>
  );
}
