import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { DestinationPreviewSignal } from '../../../presentation/store/types';
import type { TilePanelLayout } from './tilePanelLayout';

function createDestinationFrameGeometry(width: number, depth: number, thickness: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -depth / 2);
  shape.lineTo(width / 2, -depth / 2);
  shape.lineTo(width / 2, depth / 2);
  shape.lineTo(-width / 2, depth / 2);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-width / 2 + thickness, -depth / 2 + thickness);
  hole.lineTo(-width / 2 + thickness, depth / 2 - thickness);
  hole.lineTo(width / 2 - thickness, depth / 2 - thickness);
  hole.lineTo(width / 2 - thickness, -depth / 2 + thickness);
  hole.closePath();
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape);
}

export default function TileDestinationPreview({
  panel,
  signal,
  reducedMotion = false,
}: {
  panel: TilePanelLayout;
  signal: DestinationPreviewSignal;
  reducedMotion?: boolean;
}) {
  const surfaceWidth = panel.surfaceSize[0] * 0.92;
  const surfaceDepth = panel.surfaceSize[1] * 0.92;
  const edgeThickness = 0.035;
  const frameGeometry = useMemo(
    () => createDestinationFrameGeometry(surfaceWidth, surfaceDepth, edgeThickness),
    [edgeThickness, surfaceDepth, surfaceWidth],
  );
  const surfaceMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const edgeMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const elapsedRef = useRef(0);
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => {
    elapsedRef.current = 0;
    invalidate();
  }, [invalidate, signal.id]);
  useFrame((_, delta) => {
    const surfaceMaterial = surfaceMaterialRef.current;
    const edgeMaterial = edgeMaterialRef.current;
    if (!surfaceMaterial || !edgeMaterial) return;
    elapsedRef.current += delta * 1000;
    if (reducedMotion) {
      surfaceMaterial.opacity = 0.7;
      edgeMaterial.opacity = 1;
      return;
    }
    if (elapsedRef.current <= signal.strongDurationMs) {
      const pulse = 0.68 + Math.sin(elapsedRef.current / 95) * 0.16;
      surfaceMaterial.opacity = pulse;
      const edgeOpacity = 0.94 + Math.sin(elapsedRef.current / 110) * 0.06;
      edgeMaterial.opacity = edgeOpacity;
    } else {
      const flicker = 0.5 + Math.sin(elapsedRef.current / 135) * 0.5;
      surfaceMaterial.opacity = 0.48 + flicker * 0.18;
      edgeMaterial.opacity = 0.72 + flicker * 0.22;
    }
    invalidate();
  });
  return (
    <group name={`DestinationPreview:${signal.tileId}`}>
      <mesh position={[0, 0.31, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[surfaceWidth, surfaceDepth]} />
        <meshBasicMaterial ref={surfaceMaterialRef} color="#fffdf2" transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh geometry={frameGeometry} position={[0, 0.325, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshBasicMaterial ref={edgeMaterialRef} color="#ffffff" transparent opacity={1} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}
