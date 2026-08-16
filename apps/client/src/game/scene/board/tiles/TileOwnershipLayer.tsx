import SelectionMarker from '../SelectionMarker';

interface TileOwnershipLayerProps {
  ownerColor?: string;
  size: readonly [number, number];
  selected: boolean;
}

export default function TileOwnershipLayer({ size, selected }: TileOwnershipLayerProps) {
  return (
    <group name="TileOwnershipLayer">
      {selected ? <SelectionMarker size={size} /> : null}
    </group>
  );
}
