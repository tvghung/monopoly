import type { OwnershipChangeSignal } from '../../../presentation/store/types';
import SelectionMarker from '../SelectionMarker';
import OwnershipFlag from './OwnershipFlag';
import type { TilePanelLayout } from './tilePanelLayout';

interface TileOwnershipLayerProps {
  ownerColor?: string;
  size: readonly [number, number];
  panel: TilePanelLayout;
  selected: boolean;
  ownershipChange?: OwnershipChangeSignal;
  reducedMotion?: boolean;
}

export default function TileOwnershipLayer({
  ownerColor,
  size,
  panel,
  selected,
  ownershipChange,
  reducedMotion = false,
}: TileOwnershipLayerProps) {
  return (
    <group name="TileOwnershipLayer">
      {ownerColor
        ? (
          <OwnershipFlag
            ownerColor={ownerColor}
            panel={panel}
            ownershipChange={ownershipChange}
            reducedMotion={reducedMotion}
          />
        )
        : null}
      {selected ? <SelectionMarker size={size} /> : null}
    </group>
  );
}
