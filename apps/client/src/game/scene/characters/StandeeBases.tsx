import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRenderQuality } from '../render/RenderQualityContext';
import { getStandeeBaseEntries, setStandeeBaseSink, subscribeStandeeBases } from './standeeBaseRegistry';
import { STANDEE_BASE_HEIGHT, STANDEE_BASE_RADIUS } from './standeeMaterial';

/** More than any room seats; a base beyond the capacity is simply not drawn. */
export const MAX_STANDEE_BASES = 8;

let baseMaterial: THREE.MeshStandardMaterial | null = null;
function getBaseMaterial(): THREE.MeshStandardMaterial {
  baseMaterial ??= new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, metalness: 0 });
  return baseMaterial;
}

export function createStandeeBaseGeometry(): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(STANDEE_BASE_RADIUS * 0.94, STANDEE_BASE_RADIUS, STANDEE_BASE_HEIGHT, 20, 1);
  geometry.translate(0, STANDEE_BASE_HEIGHT / 2, 0);
  return geometry;
}

const colorScratch = new THREE.Color();

function setBaseShadow(mesh: THREE.InstancedMesh, enabled: boolean): void {
  mesh.castShadow = enabled;
}

/** Brings the instanced mesh up to date with the registered anchors: the matrices and the colors. */
export function syncStandeeBases(mesh: THREE.InstancedMesh): void {
  const entries = getStandeeBaseEntries().slice(0, MAX_STANDEE_BASES);
  entries.forEach((entry, index) => {
    entry.anchor.updateWorldMatrix(true, false);
    mesh.setMatrixAt(index, entry.anchor.matrixWorld);
    mesh.setColorAt(index, colorScratch.set(entry.color));
  });
  mesh.count = entries.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/**
 * One instanced draw for the round bases of all standees (plan 05 §8.4). The bases are brought up to date by the billboards at
 * the end of their frame update (`syncStandeeBasesNow`), so they never lag a frame behind their cards; this component also
 * syncs once per frame itself, for anchors that no billboard drives (the style sheet).
 */
export default function StandeeBases() {
  const invalidate = useThree(state => state.invalidate);
  const { shadows } = useRenderQuality();
  const geometry = useMemo(() => createStandeeBaseGeometry(), []);
  const mesh = useMemo(() => {
    const instanced = new THREE.InstancedMesh(geometry, getBaseMaterial(), MAX_STANDEE_BASES);
    instanced.name = 'StandeeBases';
    instanced.count = 0;
    instanced.frustumCulled = false;
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Allocated up front, so the shader variant never changes when the first player sits down.
    instanced.setColorAt(0, new THREE.Color('#ffffff'));
    instanced.receiveShadow = true;
    instanced.onBeforeRender = () => syncStandeeBases(instanced);
    return instanced;
  }, [geometry]);

  useEffect(() => {
    setBaseShadow(mesh, shadows.enabled);
  }, [mesh, shadows.enabled]);

  useEffect(() => {
    setStandeeBaseSink(() => syncStandeeBases(mesh));
    return () => setStandeeBaseSink(null);
  }, [mesh]);
  useFrame(() => syncStandeeBases(mesh));

  useEffect(() => subscribeStandeeBases(() => invalidate()), [invalidate]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return <primitive object={mesh} />;
}
