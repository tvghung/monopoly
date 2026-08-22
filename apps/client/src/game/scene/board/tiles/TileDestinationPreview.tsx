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
}: {
  panel: TilePanelLayout;
  signal: DestinationPreviewSignal;
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
    if (elapsedRef.current <= signal.strongDurationMs) {
      const pulse = 0.5 + Math.sin(elapsedRef.current / 95) * 0.12;
      surfaceMaterial.opacity = pulse;
      const edgeOpacity = 0.78 + Math.sin(elapsedRef.current / 110) * 0.12;
      edgeMaterial.opacity = edgeOpacity;
      invalidate();
    } else {
      surfaceMaterial.opacity = 0.24;
      edgeMaterial.opacity = 0.56;
    }
  });
  return (
    <group name={`DestinationPreview:${signal.tileId}`}>
      <mesh position={[0, 0.31, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[surfaceWidth, surfaceDepth]} />
        <meshBasicMaterial ref={surfaceMaterialRef} color="#ffe064" transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh geometry={frameGeometry} position={[0, 0.325, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshBasicMaterial ref={edgeMaterialRef} color="#fff0a0" transparent opacity={0.82} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}
