import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  getBoardMaterialProps,
  type BoardMaterialProfile,
} from '../materials/boardMaterialSpecs';

export interface MergedBoxSpec {
  width: number;
  height: number;
  depth: number;
  radius: number;
  segments?: number;
  /** Any CSS color; baked into a per-vertex color so boxes of one material can differ in color. */
  color: string;
  position: readonly [number, number, number];
  rotation?: readonly [number, number, number];
}

const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
const scratchScale = new THREE.Vector3(1, 1, 1);
const scratchMatrix = new THREE.Matrix4();

/**
 * Bakes rounded boxes (position, rotation and color included) into one geometry so a group of
 * static parts that share a material profile costs one draw call instead of one per box.
 */
export function createMergedBoxGeometry(specs: readonly MergedBoxSpec[]): THREE.BufferGeometry {
  if (specs.length === 0) throw new Error('createMergedBoxGeometry needs at least one box');
  const parts = specs.map(spec => {
    const geometry = new RoundedBoxGeometry(spec.width, spec.height, spec.depth, spec.segments ?? 2, spec.radius);
    scratchPosition.set(...spec.position);
    scratchEuler.set(...(spec.rotation ?? [0, 0, 0]));
    scratchQuaternion.setFromEuler(scratchEuler);
    geometry.applyMatrix4(scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale));
    const color = new THREE.Color(spec.color);
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  });
  const merged = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  if (!merged) throw new Error('Rounded box geometries could not be merged');
  return merged;
}

/**
 * Canonical content key of a spec list: two lists with the same key bake the same geometry, whatever array they live in or
 * the order their properties were written in.
 */
export function getMergedBoxSpecsKey(specs: readonly MergedBoxSpec[]): string {
  return specs.map(spec => [
    spec.width, spec.height, spec.depth, spec.radius, spec.segments ?? 2, spec.color,
    ...spec.position, ...(spec.rotation ?? [0, 0, 0]),
  ].join(',')).join(';');
}

/**
 * The merged geometry of a spec list, owned by the calling component: built once for as long as the spec *content* stays
 * the same (a new but equal array reuses it; audit PERF-02 rebuilt ~27 rounded boxes on every board render) and disposed
 * when the content changes or the component unmounts. It is deliberately not shared between components: each owner
 * disposes only what it built, so no consumer can be left holding a disposed geometry.
 */
export function useMergedBoxGeometry(specs: readonly MergedBoxSpec[]): THREE.BufferGeometry {
  const key = useMemo(() => getMergedBoxSpecsKey(specs), [specs]);
  const stableRef = useRef({ key, specs });
  if (stableRef.current.key !== key) stableRef.current = { key, specs };
  const stableSpecs = stableRef.current.specs;
  const geometry = useMemo(() => createMergedBoxGeometry(stableSpecs), [stableSpecs]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

interface MergedRoundedBoxesProps {
  name: string;
  /** Equal content reuses the geometry, so callers need not memoize the array (they still should: it avoids building the key). */
  specs: readonly MergedBoxSpec[];
  materialProfile: BoardMaterialProfile;
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
}

export default function MergedRoundedBoxes({
  name,
  specs,
  materialProfile,
  position,
  rotation,
}: MergedRoundedBoxesProps) {
  const geometry = useMergedBoxGeometry(specs);
  // A fresh `userData` object per render reads as a changed prop to R3F, which then asks for a frame.
  const boxCount = specs.length;
  const userData = useMemo(() => ({ mergedBoxCount: boxCount }), [boxCount]);

  return (
    <mesh name={name} position={position} rotation={rotation} userData={userData}>
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial {...getBoardMaterialProps(materialProfile, '#ffffff')} vertexColors />
    </mesh>
  );
}
