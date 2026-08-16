import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';

interface HandcuffVisualProps {
  panel: TilePanelLayout;
}

export const HANDCUFF_ART_FOOTPRINT_RATIO = 0.8;

export default function HandcuffVisual({ panel }: HandcuffVisualProps) {
  const radius = Math.min(panel.surfaceSize[0], panel.surfaceSize[1]) * 0.19;
  const cuffSpacing = radius * 1.1;
  const torusGeometry = useMemo(
    () => new THREE.TorusGeometry(radius, radius * 0.16, 8, 16),
    [radius],
  );
  const chainGeometry = useMemo(
    () => new THREE.TorusGeometry(radius * 0.24, radius * 0.08, 6, 12),
    [radius],
  );

  useEffect(() => () => {
    torusGeometry.dispose();
    chainGeometry.dispose();
  }, [chainGeometry, torusGeometry]);

  const chainPositions = [-radius * 0.17, radius * 0.17] as const;

  return (
    <group
      name="HandcuffVisual"
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.014, panel.side === 'CORNER' ? 0 : panel.upperArtCenterLocalZ]}
      rotation={[0, panel.contentRotationY, 0]}
      userData={{ footprintRatio: HANDCUFF_ART_FOOTPRINT_RATIO, continuousChain: true }}
    >
      {[-cuffSpacing, cuffSpacing].map(x => (
        <mesh
          key={x}
          name="HandcuffRing"
          geometry={torusGeometry}
          position={[x, 0.055, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <meshStandardMaterial
            color={boardVisualTokens.handcuffMetal}
            roughness={0.3}
            metalness={0.64}
          />
        </mesh>
      ))}
      <RoundedBoxMesh
        name="HandcuffHingeLeft"
        width={radius * 0.42}
        height={0.08}
        depth={radius * 0.34}
        radius={0.025}
        color={boardVisualTokens.handcuffMetal}
        materialProfile="metal"
        position={[-radius * 0.72, 0.06, 0]}
      />
      <RoundedBoxMesh
        name="HandcuffHingeRight"
        width={radius * 0.42}
        height={0.08}
        depth={radius * 0.34}
        radius={0.025}
        color={boardVisualTokens.handcuffMetal}
        materialProfile="metal"
        position={[radius * 0.72, 0.06, 0]}
      />
      {chainPositions.map((z, index) => (
        <mesh
          key={z}
          name={`HandcuffChainLink${index + 1}`}
          geometry={chainGeometry}
          position={[0, 0.064, z]}
          rotation={[-Math.PI / 2, index === 0 ? 0.28 : -0.28, 0]}
        >
          <meshStandardMaterial
            color={boardVisualTokens.handcuffMetalDark}
            roughness={0.28}
            metalness={0.7}
          />
        </mesh>
      ))}
    </group>
  );
}
