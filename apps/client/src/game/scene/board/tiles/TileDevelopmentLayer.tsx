import BuildingLayer from '../../buildings/BuildingLayer';
import type { DevelopmentChangeSignal } from '../../../presentation/store/types';

export default function TileDevelopmentLayer({
  houses,
  developmentChange,
  ownerColor,
  reducedMotion,
}: {
  houses: number;
  developmentChange?: DevelopmentChangeSignal;
  ownerColor?: string;
  reducedMotion?: boolean;
}) {
  return (
    <group name="TileDevelopmentLayer">
      {houses > 0
        ? <BuildingLayer
            houses={houses}
            developmentChange={developmentChange}
            ownerColor={ownerColor}
            reducedMotion={reducedMotion}
          />
        : null}
    </group>
  );
}
