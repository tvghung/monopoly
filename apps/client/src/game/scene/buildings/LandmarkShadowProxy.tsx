import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeKit } from './kit/lowPolyKit';
import type { BoardTileRenderModel } from '../board/boardRenderModel';
import { transformTileLocalPointToWorld, getBoardTileLayout } from '../board/boardLayout';
import { useRenderQuality } from '../render/RenderQualityContext';
import { getLandmarkLocalOrigin } from './LandmarkMesh';
import { getLandmarkDefinition, getLandmarkGeometry } from './landmarks/registry';

/** The tiles that show a landmark right now: a street at the hotel tier with a landmark built for it. */
export function getVisibleLandmarkTiles(tiles: readonly BoardTileRenderModel[]): number[] {
  return tiles
    .filter(tile => tile.houses === 5 && getLandmarkDefinition(tile.tileId) !== undefined)
    .map(tile => tile.tileId)
    .sort((left, right) => left - right);
}

/**
 * One geometry, in world space, with the shapes of all the given landmarks (plinths included). It only exists to cast their
 * shadows in a single shadow-pass draw (plan 05 §8.8); it is never visible.
 */
export function buildLandmarkShadowGeometry(tileIds: readonly number[]): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const matrix = new THREE.Matrix4();
  for (const tileId of tileIds) {
    const geometry = getLandmarkGeometry(tileId);
    const layout = getBoardTileLayout(tileId);
    const origin = getLandmarkLocalOrigin(tileId);
    const world = origin ? transformTileLocalPointToWorld(tileId, origin) : undefined;
    if (!geometry || !layout || !world) continue;
    matrix.compose(
      new THREE.Vector3(...world),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, layout.rotation[1], 0)),
      new THREE.Vector3(1, 1, 1),
    );
    for (const source of [geometry.opaque, geometry.glass]) {
      if (source) parts.push(source.clone().applyMatrix4(matrix));
    }
  }
  return parts.length > 0 ? mergeKit(parts) : null;
}

let proxyMaterial: THREE.MeshBasicMaterial | null = null;
function getProxyMaterial(): THREE.MeshBasicMaterial {
  // Draws nothing in the main pass; the shadow pass swaps in its own depth material and only checks that this one is visible.
  proxyMaterial ??= new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  return proxyMaterial;
}

/**
 * Casts the shadow of every landmark on the board with one mesh, so the shadow pass costs one draw however many landmarks
 * stand (plan 05 §8.8). The geometry is rebuilt only when the set of visible landmarks changes.
 */
export default function LandmarkShadowProxy({ tiles }: { tiles: readonly BoardTileRenderModel[] }) {
  const { shadows } = useRenderQuality();
  const key = getVisibleLandmarkTiles(tiles).join(',');
  const geometry = useMemo(() => (shadows.enabled && key
    ? buildLandmarkShadowGeometry(key.split(',').map(Number))
    : null), [key, shadows.enabled]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return <mesh name="LandmarkShadowProxy" geometry={geometry} material={getProxyMaterial()} castShadow frustumCulled={false} dispose={null} />;
}
