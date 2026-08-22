import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { DestinationPreviewSignal } from '../../../presentation/store/types';
import type { TilePanelLayout } from './tilePanelLayout';

export default function TileDestinationPreview({
  panel,
  signal,
}: {
  panel: TilePanelLayout;
  signal: DestinationPreviewSignal;
}) {
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const elapsedRef = useRef(0);
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => {
    elapsedRef.current = 0;
    invalidate();
  }, [invalidate, signal.id]);
  useFrame((_, delta) => {
    const material = materialRef.current;
    if (!material) return;
    elapsedRef.current += delta * 1000;
    if (elapsedRef.current <= signal.strongDurationMs) {
      material.opacity = 0.34 + Math.sin(elapsedRef.current / 95) * 0.12;
      invalidate();
    } else {
      material.opacity = 0.16;
    }
  });
  return (
    <mesh position={[0, 0.31, 0]} rotation={[-Math.PI / 2, 0, 0]} name={`DestinationPreview:${signal.tileId}`}>
      <planeGeometry args={[panel.surfaceSize[0] * 0.92, panel.surfaceSize[1] * 0.92]} />
      <meshBasicMaterial ref={materialRef} color="#ffe064" transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}
