import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { getPlayerDisplayColor } from '../../ui/playerVisualColors';
import { CONTACT_SHADOW_Y } from '../board/architecture/boardArtSpec';
import ContactShadow from '../fx/ContactShadow';
import { useRenderQuality } from '../render/RenderQualityContext';
import { kitEmissiveMaterial, kitGlassMaterial, kitOpaqueMaterial } from './kit/kitMaterials';
import { NEUTRAL_RIM } from './landmarks/plinth';
import { recolorRim } from './landmarks/assemble';
import { PLINTH } from './landmarks/limits';
import { getLandmarkGeometry } from './landmarks/registry';
import { TUBE_HOUSE_BASE_Y, getTubeHouseRowLocalZ } from './tubeHouseLayout';

interface LandmarkMeshProps {
  tileId: number;
  ownerColor?: string;
}

/** Where the plinth top is, in the tile-local frame: the landmark stands on it. */
export function getLandmarkLocalOrigin(tileId: number): readonly [number, number, number] | undefined {
  const z = getTubeHouseRowLocalZ(tileId);
  return z === undefined ? undefined : [0, TUBE_HOUSE_BASE_Y + PLINTH.height, z];
}

/**
 * The landmark of a street at the hotel tier (plan 05 §8.3): the cached geometry cloned per mounted landmark (so the plinth rim
 * can take its owner's color without touching the shared copy), drawn with the three shared kit materials. It lives under the
 * tile's own groups, so the tile press and the hotel transition move and scale it like the hotel it replaces. It casts no
 * shadow itself: `LandmarkShadowProxy` casts the shadow of all landmarks in one draw.
 */
export function LandmarkBody({ tileId, ownerColor }: LandmarkMeshProps) {
  const invalidate = useThree(state => state.invalidate);
  const { buildingContactShadows } = useRenderQuality();
  const source = getLandmarkGeometry(tileId);
  const geometries = useMemo(() => (source
    ? { opaque: source.opaque.clone(), glass: source.glass, emissive: source.emissive }
    : null), [source]);

  useLayoutEffect(() => {
    if (!geometries || !source) return;
    recolorRim(geometries.opaque, source.rimVertexCount, ownerColor ? getPlayerDisplayColor(ownerColor) : NEUTRAL_RIM);
    invalidate();
  }, [geometries, invalidate, ownerColor, source]);
  useEffect(() => () => geometries?.opaque.dispose(), [geometries]);

  if (!geometries) return null;
  return (
    <group name="LandmarkBody">
      <mesh name="LandmarkOpaque" geometry={geometries.opaque} material={kitOpaqueMaterial} receiveShadow dispose={null} />
      {geometries.glass
        ? <mesh name="LandmarkGlass" geometry={geometries.glass} material={kitGlassMaterial} receiveShadow dispose={null} />
        : null}
      {geometries.emissive
        ? <mesh name="LandmarkEmissive" geometry={geometries.emissive} material={kitEmissiveMaterial} dispose={null} />
        : null}
      {buildingContactShadows
        ? <ContactShadow position={[0, CONTACT_SHADOW_Y - PLINTH.height, 0]} scale={[PLINTH.size * 1.15, PLINTH.size * 1.15]} opacity={0.22} />
        : null}
    </group>
  );
}

/** The landmark placed on its tile: standing on the plinth top, centered on the upper art panel. */
export default function LandmarkMesh({ tileId, ownerColor }: LandmarkMeshProps) {
  const origin = getLandmarkLocalOrigin(tileId);
  if (!origin) return null;
  return (
    <group name="LandmarkVisual" position={[origin[0], origin[1], origin[2]]}>
      <LandmarkBody tileId={tileId} ownerColor={ownerColor} />
    </group>
  );
}
