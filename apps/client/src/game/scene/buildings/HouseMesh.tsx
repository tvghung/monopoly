import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  HOUSE_BODY_DEPTH,
  HOUSE_BODY_HEIGHT,
  HOUSE_BODY_WIDTH,
  HOUSE_ROOF_DEPTH,
  HOUSE_ROOF_HEIGHT,
  HOUSE_ROOF_WIDTH,
} from '../board/architecture/boardArtSpec';
import { boardVisualTokens } from '../board/boardVisualTokens';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import { getBoardMaterialProps } from '../board/materials/boardMaterialSpecs';
import ContactShadow from '../fx/ContactShadow';
import { getPlayerDisplayColor } from '../../ui/playerVisualColors';
import {
  FACADE_TEXTURE_TINT,
  HOUSE_FACADE_TEXTURE,
  HOUSE_FACADE_WALL_COLOR,
} from './buildingFacadeTextures';
import { createPitchedRoofGeometry } from './houseRoofGeometry';

export function getHouseWallColor(): string {
  return HOUSE_FACADE_WALL_COLOR;
}

export function getHouseRoofColor(ownerColor?: string): string {
  return ownerColor ? getPlayerDisplayColor(ownerColor) : boardVisualTokens.houseDark;
}

function PitchedHouseRoof({ color }: { color: string }) {
  const geometry = useMemo(
    () => createPitchedRoofGeometry(HOUSE_ROOF_WIDTH, HOUSE_ROOF_DEPTH, HOUSE_ROOF_HEIGHT),
    [],
  );
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({
      ...getBoardMaterialProps('houseRoof', color),
      flatShading: true,
    }),
    [color],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh
      name="HouseRoof"
      geometry={geometry}
      material={material}
      position={[0, HOUSE_BODY_HEIGHT / 2, 0]}
      dispose={null}
    />
  );
}

export default function HouseMesh({
  position,
  ownerColor,
}: { position: readonly [number, number, number]; ownerColor?: string }) {
  const roofColor = getHouseRoofColor(ownerColor);
  return (
    <group name="HouseVisual" position={position}>
      <RoundedBoxMesh
        name="HouseWall"
        width={HOUSE_BODY_WIDTH}
        height={HOUSE_BODY_HEIGHT}
        depth={HOUSE_BODY_DEPTH}
        radius={0.045}
        color={FACADE_TEXTURE_TINT}
        map={HOUSE_FACADE_TEXTURE}
        materialProfile="houseWall"
      />
      <PitchedHouseRoof color={roofColor} />
      <ContactShadow scale={[0.58, 0.48]} opacity={0.2} />
    </group>
  );
}
