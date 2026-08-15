import { CENTER_PARK_SURFACE_Y } from '../architecture/boardArtSpec';
import { boardVisualTokens } from '../boardVisualTokens';
import RoundedBoxMesh from '../geometry/RoundedBoxMesh';
import ParkFountain from './ParkFountain';
import ParkFurniture from './ParkFurniture';
import ParkTrees from './ParkTrees';

export const CENTER_DECORATION_MESH_COUNT = 6;

export default function CenterPark() {
  return (
    <group name="CenterPark" position={[0, CENTER_PARK_SURFACE_Y, 0]}>
      <RoundedBoxMesh
        name="ParkGrassPlatform"
        width={7.8}
        height={0.08}
        depth={7.8}
        radius={0.16}
        color={boardVisualTokens.plazaBase}
        materialProfile="boardTop"
        position={[0, 0.04, 0]}
      />
      <RoundedBoxMesh
        name="ParkVerticalPath"
        width={0.56}
        height={0.035}
        depth={7.25}
        radius={0.03}
        color={boardVisualTokens.plazaPath}
        materialProfile="parkPath"
        position={[0, 0.1, 0]}
      />
      <RoundedBoxMesh
        name="ParkHorizontalPath"
        width={7.25}
        height={0.035}
        depth={0.56}
        radius={0.03}
        color={boardVisualTokens.plazaPath}
        materialProfile="parkPath"
        position={[0, 0.102, 0]}
      />
      <ParkFountain />
      <ParkTrees />
      <ParkFurniture />
    </group>
  );
}
