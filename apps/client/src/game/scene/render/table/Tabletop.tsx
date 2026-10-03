import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { getTileTextureAnisotropy } from '../../board/architecture/sceneBudget';
import { useRenderQuality } from '../RenderQualityContext';
import { createTableTextures } from './tableTextures';
import { TABLETOP_SIZE, TABLETOP_Y } from './tabletopCoverage';

export const TABLETOP_ROUGHNESS = 0.62;

/**
 * The light oak table under the board (plan 02 §8.5). It replaces the flat colored clear color, so there
 * is no void at any aspect ratio; its texture size and roughness variation follow the graphics tier.
 */
export default function Tabletop() {
  const maxAnisotropy = useThree(state => state.gl.capabilities.getMaxAnisotropy());
  const invalidate = useThree(state => state.invalidate);
  const { tableTextureSize, tableRoughnessVariation, shadows } = useRenderQuality();
  const textures = useMemo(
    () => createTableTextures(tableTextureSize, TABLETOP_SIZE, {
      roughnessVariation: tableRoughnessVariation,
      anisotropy: getTileTextureAnisotropy(maxAnisotropy),
    }),
    [maxAnisotropy, tableRoughnessVariation, tableTextureSize],
  );

  useEffect(() => {
    invalidate();
    return () => textures.dispose();
  }, [invalidate, textures]);

  return (
    <mesh
      name="Tabletop"
      position={[0, TABLETOP_Y, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow={shadows.enabled}
    >
      <planeGeometry args={[TABLETOP_SIZE, TABLETOP_SIZE]} />
      <meshStandardMaterial
        map={textures.albedo}
        // `null`, not `undefined`: R3F skips an undefined prop, so after a switch to a tier without the roughness variation the
        // material would keep pointing at the texture that was just disposed.
        roughnessMap={textures.roughness ?? null}
        roughness={TABLETOP_ROUGHNESS}
        metalness={0}
      />
    </mesh>
  );
}
