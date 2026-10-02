import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { DevelopmentChangeSignal } from '../../presentation/store/types';
import { mergeKit } from './kit/lowPolyKit';
import type { BoardTileRenderModel } from '../board/boardRenderModel';
import { transformTileLocalPointToWorld, getBoardTileLayout } from '../board/boardLayout';
import { useRenderQuality } from '../render/RenderQualityContext';
import { SHADOW_ONLY_LAYER } from '../render/shadowLayers';
import { getLandmarkLocalOrigin } from './LandmarkMesh';
import { getLandmarkGeometry, hasLandmark } from './landmarks/registry';
import { planHouseAnimations } from './tubeHouseAnimation';

/**
 * The tiles that show a landmark right now: a street at the hotel tier with a landmark built for it. `hidden` lists tiles
 * whose landmark is still popping in (the 4 → 5 transition), which must not cast a full-size shadow before it exists.
 */
export function getVisibleLandmarkTiles(tiles: readonly BoardTileRenderModel[], hidden: ReadonlySet<number> = new Set()): number[] {
  return tiles
    .filter(tile => tile.houses === 5 && !hidden.has(tile.tileId) && hasLandmark(tile.tileId))
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
  // The shadow pass swaps in its own depth material and only checks that this one is visible.
  proxyMaterial ??= new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  return proxyMaterial;
}

/** The proxy mesh on the shadow-only layer: the key light's shadow camera draws it, the main camera never does. */
export function createLandmarkShadowMesh(geometry: THREE.BufferGeometry): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, getProxyMaterial());
  mesh.name = 'LandmarkShadowProxy';
  mesh.layers.set(SHADOW_ONLY_LAYER);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

interface LandmarkShadowProxyProps {
  tiles: readonly BoardTileRenderModel[];
  developmentChanges?: ReadonlyMap<number, DevelopmentChangeSignal>;
  reducedMotion?: boolean;
}

/**
 * Casts the shadow of every landmark on the board with one mesh, so the shadow pass costs one draw however many landmarks
 * stand and the main pass pays nothing (plan 05 §8.8). The geometry is rebuilt only when the set of visible landmarks changes;
 * a landmark that is still popping in leaves the set until its transition is over.
 */
export default function LandmarkShadowProxy({ tiles, developmentChanges, reducedMotion = false }: LandmarkShadowProxyProps) {
  const { shadows } = useRenderQuality();
  const popping = useMemo(() => new Set(
    planHouseAnimations(tiles, developmentChanges ?? new Map(), reducedMotion)
      .filter(animation => animation.kind === 'HOTEL')
      .map(animation => animation.tileId),
  ), [developmentChanges, reducedMotion, tiles]);
  const key = getVisibleLandmarkTiles(tiles, popping).join(',');
  const mesh = useMemo(() => {
    if (!shadows.enabled || !key) return null;
    const geometry = buildLandmarkShadowGeometry(key.split(',').map(Number));
    return geometry ? createLandmarkShadowMesh(geometry) : null;
  }, [key, shadows.enabled]);
  useEffect(() => () => mesh?.geometry.dispose(), [mesh]);
  if (!mesh) return null;
  return <primitive object={mesh} />;
}
