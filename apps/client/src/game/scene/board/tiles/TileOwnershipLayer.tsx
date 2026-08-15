import OwnershipMarker from '../OwnershipMarker';
import SelectionMarker from '../SelectionMarker';

interface TileOwnershipLayerProps {
  ownerColor?: string;
  size: readonly [number, number];
  selected: boolean;
}

export default function TileOwnershipLayer({ ownerColor, size, selected }: TileOwnershipLayerProps) {
  return (
    <group name="TileOwnershipLayer">
      {ownerColor ? <OwnershipMarker color={ownerColor} size={size} /> : null}
      {selected ? <SelectionMarker size={size} /> : null}
    </group>
  );
}
