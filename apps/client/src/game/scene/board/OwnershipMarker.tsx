import {
  OWNERSHIP_MARKER_CENTER_Y,
  OWNERSHIP_MARKER_HEIGHT,
} from './boardLayout';
import { getPlayerDisplayColor } from '../../ui/playerVisualColors';
import RoundedBoxMesh from './geometry/RoundedBoxMesh';

interface OwnershipMarkerProps {
  color: string;
  size: readonly [number, number];
}

export default function OwnershipMarker({ color, size }: OwnershipMarkerProps) {
  const displayColor = getPlayerDisplayColor(color);
  return (
    <RoundedBoxMesh
      name="OwnerTab"
      width={Math.max(0.55, size[0] * 0.72)}
      height={OWNERSHIP_MARKER_HEIGHT}
      depth={0.12}
      radius={0.025}
      color={displayColor}
      materialProfile="propertyTrim"
      position={[0, OWNERSHIP_MARKER_CENTER_Y, size[1] / 2 - 0.31]}
    />
  );
}
