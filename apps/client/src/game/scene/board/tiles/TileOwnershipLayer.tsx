import SelectionMarker from '../SelectionMarker';
import OwnershipFlag from './OwnershipFlag';
import type { TilePanelLayout } from './tilePanelLayout';

interface TileOwnershipLayerProps {
  ownerColor?: string;
  size: readonly [number, number];
  panel: TilePanelLayout;
  selected: boolean;
}

export default function TileOwnershipLayer({
  ownerColor,
  size,
  panel,
  selected,
}: TileOwnershipLayerProps) {
  return (
    <group name="TileOwnershipLayer">
      {ownerColor ? <OwnershipFlag ownerColor={ownerColor} panel={panel} /> : null}
      {selected ? <SelectionMarker size={size} /> : null}
    </group>
  );
}
