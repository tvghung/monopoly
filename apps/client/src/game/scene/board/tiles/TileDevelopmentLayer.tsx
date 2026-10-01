import BuildingLayer from '../../buildings/BuildingLayer';
import type { DevelopmentChangeSignal } from '../../../presentation/store/types';

export default function TileDevelopmentLayer({
  tileId,
  houses,
  developmentChange,
  ownerColor,
  reducedMotion,
}: {
  tileId: number;
  houses: number;
  developmentChange?: DevelopmentChangeSignal;
  ownerColor?: string;
  reducedMotion?: boolean;
}) {
  return (
    <group name="TileDevelopmentLayer">
      {houses > 0
        ? <BuildingLayer
            tileId={tileId}
            houses={houses}
            developmentChange={developmentChange}
            ownerColor={ownerColor}
            reducedMotion={reducedMotion}
          />
        : null}
    </group>
  );
}
