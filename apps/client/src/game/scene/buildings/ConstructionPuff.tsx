import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getPlayerDisplayColor } from '../../ui/playerVisualColors';
import { getAnimationElapsedMs } from '../animationTime';

export function createConstructionPuffMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true, color: '#ffffff', transparent: true, opacity: 0.86, roughness: 0.94,
  });
}

/**
 * One puff material for every construction burst, owned by the always-mounted house layer. A puff exists only while a
 * building appears; its own material was disposed with it, which released the shader program, so every build linked the
 * identical program again on the main thread (audit PERF-05). The owner color travels in the instance colors, so the
 * material itself never changes.
 */
export function useConstructionPuffMaterial(): THREE.MeshStandardMaterial {
  const material = useMemo(() => createConstructionPuffMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

/** The dust-and-owner-color burst that plays where a building appears (frozen Phase 4 timing). */
export default function ConstructionPuff({
  delayMs,
  durationMs,
  ownerColor,
  particleCount = 11,
  spread = 0.32,
  lift = 0.22,
  material,
}: {
  delayMs: number;
  durationMs: number;
  ownerColor?: string;
  particleCount?: number;
  spread?: number;
  lift?: number;
  /** A material owned by the caller (never disposed here); without one the puff creates and releases its own. */
  material?: THREE.Material;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const startedAtMsRef = useRef(0);
  const objectRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const invalidate = useThree(state => state.invalidate);
  const ownerDisplayColor = useMemo(() => new THREE.Color(getPlayerDisplayColor(ownerColor)), [ownerColor]);
  const dustColor = useMemo(() => new THREE.Color('#e8d8bb'), []);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let index = 0; index < particleCount; index += 1) {
      mesh.setColorAt(index, index % 3 === 0 ? ownerDisplayColor : dustColor);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [dustColor, ownerDisplayColor, particleCount]);
  useLayoutEffect(() => { startedAtMsRef.current = performance.now(); invalidate(); }, [invalidate]);
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const object = objectRef.current;
    const local = getAnimationElapsedMs(startedAtMsRef.current) - delayMs;
    const progress = THREE.MathUtils.clamp(local / Math.max(1, durationMs), 0, 1);
    const burstProgress = 1 - (1 - progress) ** 3;
    for (let index = 0; index < particleCount; index += 1) {
      const angle = index / particleCount * Math.PI * 2;
      const distance = burstProgress * spread;
      object.position.set(Math.cos(angle) * distance, 0.03 + burstProgress * lift, Math.sin(angle) * distance);
      object.scale.setScalar(local >= 0 && progress < 1 ? (1 - progress) * 0.85 : 0);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (local < durationMs) invalidate();
  });
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, particleCount]}>
      <octahedronGeometry args={[0.068, 0]} />
      {material
        ? <primitive object={material} attach="material" dispose={null} />
        : <meshStandardMaterial vertexColors color="#ffffff" transparent opacity={0.86} roughness={0.94} />}
    </instancedMesh>
  );
}
