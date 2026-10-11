import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tileState } from '@monopoly/shared';
import { getBoardTileLayout, getTileSurfaceGeometry } from '../boardLayout';
import { composeTileSurfaceMatrix } from '../architecture/tileMatrix';
import type { BoardTileRenderModel } from '../boardRenderModel';
import type { TileMotionController } from '../motion/TileMotionController';
import { useTileMotionController } from '../motion/TileMotionProvider';
import { withPanel, type TileSurfaceBatchEntry } from './TileSurfaceBatch';

export const TILE_IMPACT_HIGHLIGHT_OPACITY = 0.12;
export const TILE_STEP_HIGHLIGHT_STRENGTH = 0.68;
export const TILE_LAND_HIGHLIGHT_STRENGTH = 1;
const TILE_HIGHLIGHT_PLANE_OFFSET = 0.002;

export function getTileImpactHighlightIntensity(
  pressIntensity: number,
  kind: 'STEP' | 'LAND' = 'STEP',
): number {
  const safeIntensity = Number.isFinite(pressIntensity)
    ? THREE.MathUtils.clamp(pressIntensity, 0, 1)
    : 0;
  return safeIntensity * (
    kind === 'LAND' ? TILE_LAND_HIGHLIGHT_STRENGTH : TILE_STEP_HIGHLIGHT_STRENGTH
  );
}

export function createTileImpactHighlightMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    name: 'TileImpactHighlightMaterial',
    color: '#fff8df',
    vertexColors: true,
    transparent: true,
    opacity: TILE_IMPACT_HIGHLIGHT_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide,
    // A transparent DoubleSide material otherwise renders in two passes (twice the draw calls).
    forceSinglePass: true,
    toneMapped: false,
  });
}

export function createTileImpactHighlightMeshBundle(
  geometry: THREE.BufferGeometry,
  entries: readonly TileSurfaceBatchEntry[],
  motionController: TileMotionController | null,
) {
  const material = createTileImpactHighlightMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  entries.forEach((entry, index) => {
    const layout = getBoardTileLayout(entry.tileId);
    if (!layout) return;
    const offsetY = motionController?.getTileOffsetY(entry.tileId) ?? 0;
    const intensity = motionController?.getTilePressIntensity(entry.tileId) ?? 0;
    const kind = motionController?.getTilePressKind(entry.tileId) ?? 'STEP';
    composeTileSurfaceMatrix(
      layout,
      entry.surfaceSize,
      offsetY,
      matrix,
      (entry.surfacePlaneOffset ?? 0) + TILE_HIGHLIGHT_PLANE_OFFSET,
    );
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, color.setScalar(getTileImpactHighlightIntensity(intensity, kind)));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.name = 'TileImpactHighlightBatch';
  mesh.renderOrder = 1;
  mesh.userData = {
    layer: 'above-tile-surface',
    contributionAtIdle: 0,
    tileCount: entries.length,
  };
  return { material, mesh };
}
interface TileImpactHighlightBatchProps {
  tiles: readonly BoardTileRenderModel[];
}

export function getTileImpactHighlightEntries(tiles: readonly BoardTileRenderModel[]): TileSurfaceBatchEntry[] {
  const baseEntries = tiles.map<TileSurfaceBatchEntry | null>(tile => {
    const layout = getBoardTileLayout(tile.tileId);
    const sourceTile = tileState[tile.tileId];
    if (!layout || !sourceTile) return null;
    return {
      tileId: tile.tileId,
      tileType: sourceTile.tileType,
      side: layout.side,
      surfaceSize: getTileSurfaceGeometry(layout).size,
      surfaceKey: undefined,
    };
  }).filter((entry): entry is TileSurfaceBatchEntry => entry !== null);
  const edgeEntries = baseEntries.filter(entry => entry.side !== 'CORNER');
  const cornerEntries = baseEntries.filter(entry => entry.side === 'CORNER');
  return [...edgeEntries.map(entry => withPanel(entry, 'upper')), ...cornerEntries];
}

export default function TileImpactHighlightBatch({
  tiles,
}: TileImpactHighlightBatchProps) {
  const entries = useMemo(() => getTileImpactHighlightEntries(tiles), [tiles]);
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const motionController = useTileMotionController();
  const meshBundle = useMemo(
    () => createTileImpactHighlightMeshBundle(geometry, entries, motionController),
    [entries, geometry, motionController],
  );
  const meshRef = useRef<THREE.InstancedMesh | null>(null);
  const matrixRef = useRef(new THREE.Matrix4());
  const colorRef = useRef(new THREE.Color());
  const previousStateRef = useRef(new Map<string, string>());

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = matrixRef.current;
    const color = colorRef.current;
    let matrixChanged = false;
    let colorChanged = false;
    entries.forEach((entry, index) => {
      const layout = getBoardTileLayout(entry.tileId);
      if (!layout) return;
      const offsetY = motionController?.getTileOffsetY(entry.tileId) ?? 0;
      const pressIntensity = motionController?.getTilePressIntensity(entry.tileId) ?? 0;
      const kind = motionController?.getTilePressKind(entry.tileId) ?? 'STEP';
      const highlightIntensity = getTileImpactHighlightIntensity(pressIntensity, kind);
      const stateKey = `${offsetY}:${highlightIntensity}`;
      const stateMapKey = `${mesh.uuid}:${entry.tileId}`;
      if (previousStateRef.current.get(stateMapKey) === stateKey) return;
      composeTileSurfaceMatrix(
        layout,
        entry.surfaceSize,
        offsetY,
        matrix,
        (entry.surfacePlaneOffset ?? 0) + TILE_HIGHLIGHT_PLANE_OFFSET,
      );
      mesh.setMatrixAt(index, matrix);
      color.setScalar(highlightIntensity);
      mesh.setColorAt(index, color);
      previousStateRef.current.set(stateMapKey, stateKey);
      matrixChanged = true;
      colorChanged = true;
    });
    if (matrixChanged) mesh.instanceMatrix.needsUpdate = true;
    if (colorChanged && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  useLayoutEffect(() => {
    meshRef.current = meshBundle.mesh;
    return () => {
      if (meshRef.current === meshBundle.mesh) meshRef.current = null;
      meshBundle.material.dispose();
    };
  }, [meshBundle]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return <primitive object={meshBundle.mesh} dispose={null} />;
}
