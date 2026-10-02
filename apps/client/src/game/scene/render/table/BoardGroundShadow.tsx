import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { FOUNDATION_SIZE } from '../../board/foundation/outerBoardAccent';
import { useRenderQuality } from '../RenderQualityContext';
import { GROUND_SHADOW_SCALE, createGroundShadowTexture } from './groundShadowTexture';

/** Just above the table (y -0.002) and below the board, so the foundation hides the opaque middle. */
export const GROUND_SHADOW_Y = 0.001;
export const GROUND_SHADOW_SIZE = FOUNDATION_SIZE * GROUND_SHADOW_SCALE;

/** Soft contact decal that sits the board on the table; stronger when real shadows are off (low tier). */
export default function BoardGroundShadow() {
  const invalidate = useThree(state => state.invalidate);
  const { groundDecalOpacity } = useRenderQuality();
  const texture = useMemo(() => createGroundShadowTexture(), []);

  useEffect(() => {
    invalidate();
    return () => texture.dispose();
  }, [invalidate, texture]);

  return (
    <mesh
      name="BoardGroundShadow"
      position={[0, GROUND_SHADOW_Y, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={-1}
    >
      <planeGeometry args={[GROUND_SHADOW_SIZE, GROUND_SHADOW_SIZE]} />
      <meshBasicMaterial
        map={texture}
        color="#000000"
        transparent
        opacity={groundDecalOpacity}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
