import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayerStationRenderModel } from '../board/boardRenderModel';
import { useRenderQuality } from '../render/RenderQualityContext';
import { createTrayBodyGeometry, createTrayRimGeometry } from './trayGeometry';
import { buildTrayInstances, trayInstancesSignature } from './trayLayout';
import { TRAY_LACQUER_COLOR } from './stationWorld';

/** Four seats and the bank: the most trays that can exist at once. */
export const MAX_TRAYS = 5;

const scratchObject = new THREE.Object3D();
const scratchColor = new THREE.Color();

/**
 * Lacquer trays under the coin piles: one instanced body and one instanced rim for every station and the
 * bank (two draw calls in total). The rim carries the player's color, so identity never depends on the
 * coins alone.
 */
export default function PlayerTrays({ stations }: { stations: readonly PlayerStationRenderModel[] }) {
  const invalidate = useThree(state => state.invalidate);
  const { shadows } = useRenderQuality();
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const rimRef = useRef<THREE.InstancedMesh>(null);
  const bodyGeometry = useMemo(() => createTrayBodyGeometry(), []);
  const rimGeometry = useMemo(() => createTrayRimGeometry(), []);
  const instances = buildTrayInstances(stations);
  const signature = trayInstancesSignature(instances);
  const appliedSignature = useRef('');

  useLayoutEffect(() => {
    if (appliedSignature.current === signature) return;
    appliedSignature.current = signature;
    const body = bodyRef.current;
    const rim = rimRef.current;
    if (!body || !rim) return;
    instances.forEach((instance, index) => {
      scratchObject.position.set(...instance.position);
      scratchObject.rotation.set(0, instance.rotationY, 0);
      scratchObject.scale.setScalar(instance.scale);
      scratchObject.updateMatrix();
      body.setMatrixAt(index, scratchObject.matrix);
      rim.setMatrixAt(index, scratchObject.matrix);
      rim.setColorAt(index, scratchColor.set(instance.rimColor));
    });
    body.count = instances.length;
    rim.count = instances.length;
    body.instanceMatrix.needsUpdate = true;
    rim.instanceMatrix.needsUpdate = true;
    if (rim.instanceColor) rim.instanceColor.needsUpdate = true;
    invalidate();
  });

  useEffect(() => () => {
    bodyGeometry.dispose();
    rimGeometry.dispose();
  }, [bodyGeometry, rimGeometry]);

  return (
    <group name="PlayerTrays">
      <instancedMesh
        ref={bodyRef}
        args={[bodyGeometry, undefined, MAX_TRAYS]}
        name="TrayBodies"
        castShadow={shadows.enabled}
        receiveShadow={shadows.enabled}
        frustumCulled={false}
      >
        <meshStandardMaterial color={TRAY_LACQUER_COLOR} roughness={0.35} metalness={0.02} />
      </instancedMesh>
      <instancedMesh
        ref={rimRef}
        args={[rimGeometry, undefined, MAX_TRAYS]}
        name="TrayRims"
        castShadow={shadows.enabled}
        frustumCulled={false}
      >
        <meshStandardMaterial color="#ffffff" roughness={0.4} metalness={0.02} />
      </instancedMesh>
    </group>
  );
}
