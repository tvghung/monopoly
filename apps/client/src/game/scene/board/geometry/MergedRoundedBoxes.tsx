import { useEffect, useMemo } from 'react';
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

interface MergedRoundedBoxesProps {
  name: string;
  /** Callers memoize the array: a new array rebuilds the geometry. */
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
  const geometry = useMemo(() => createMergedBoxGeometry(specs), [specs]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh name={name} position={position} rotation={rotation} userData={{ mergedBoxCount: specs.length }}>
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial {...getBoardMaterialProps(materialProfile, '#ffffff')} vertexColors />
    </mesh>
  );
}
