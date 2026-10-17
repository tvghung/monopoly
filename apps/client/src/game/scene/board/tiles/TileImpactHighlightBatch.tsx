import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { tileState } from '@monopoly/shared';
import { getBoardTileLayout, getTileSurfaceGeometry, type BoardTileLayout } from '../boardLayout';
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

/** Highlight entries depend only on which tiles exist: layout and tile type are static data. */
export function getTileImpactHighlightEntriesForIds(tileIds: readonly number[]): TileSurfaceBatchEntry[] {
  const baseEntries = tileIds.map<TileSurfaceBatchEntry | null>(tileId => {
    const layout = getBoardTileLayout(tileId);
    const sourceTile = tileState[tileId];
    if (!layout || !sourceTile) return null;
    return {
      tileId,
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

export function getTileImpactHighlightEntries(tiles: readonly BoardTileRenderModel[]): TileSurfaceBatchEntry[] {
  return getTileImpactHighlightEntriesForIds(tiles.map(tile => tile.tileId));
}

/**
 * The batch's GPU resources and the per-tile state needed to keep them current, owned by one object so the component only
 * decides when to create and when to dispose it. Created once per (tile set, motion controller); the audit found it was
 * rebuilt on every board render, which re-linked the identical shader program and left the old buffers undisposed.
 */
export interface TileImpactHighlightResources {
  readonly mesh: THREE.InstancedMesh;
  readonly material: THREE.MeshBasicMaterial;
  readonly geometry: THREE.PlaneGeometry;
  readonly entries: readonly TileSurfaceBatchEntry[];
  /** Number of tiles whose last written state is remembered: fixed at creation, never grows. */
  readonly trackedTiles: number;
  /** Writes the controller's current offset and intensity for the tiles whose state changed; true when anything was written. */
  sync(controller: TileMotionController | null): boolean;
  /**
   * Releases the mesh's instance buffers, the material (and its program reference) and the geometry. Safe to call again:
   * three.js re-creates GPU resources on the next render, which is what a development double-mount relies on.
   */
  dispose(): void;
}

export function createTileImpactHighlightResources(
  entries: readonly TileSurfaceBatchEntry[],
  controller: TileMotionController | null,
): TileImpactHighlightResources {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const { mesh, material } = createTileImpactHighlightMeshBundle(geometry, entries, controller);
  const layouts: (BoardTileLayout | undefined)[] = entries.map(entry => getBoardTileLayout(entry.tileId));
  // NaN never equals a real value, so the first sync writes every tile once, exactly like the first frame always did.
  const lastOffsets = new Float64Array(entries.length).fill(Number.NaN);
  const lastIntensities = new Float64Array(entries.length).fill(Number.NaN);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  return {
    mesh,
    material,
    geometry,
    entries,
    trackedTiles: entries.length,
    sync(motionController) {
      let changed = false;
      entries.forEach((entry, index) => {
        const layout = layouts[index];
        if (!layout) return;
        const offsetY = motionController?.getTileOffsetY(entry.tileId) ?? 0;
        const pressIntensity = motionController?.getTilePressIntensity(entry.tileId) ?? 0;
        const kind = motionController?.getTilePressKind(entry.tileId) ?? 'STEP';
        const highlightIntensity = getTileImpactHighlightIntensity(pressIntensity, kind);
        if (lastOffsets[index] === offsetY && lastIntensities[index] === highlightIntensity) return;
        composeTileSurfaceMatrix(
          layout,
          entry.surfaceSize,
          offsetY,
          matrix,
          (entry.surfacePlaneOffset ?? 0) + TILE_HIGHLIGHT_PLANE_OFFSET,
        );
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, color.setScalar(highlightIntensity));
        lastOffsets[index] = offsetY;
        lastIntensities[index] = highlightIntensity;
        changed = true;
      });
      if (changed) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      return changed;
    },
    dispose() {
      mesh.dispose();
      material.dispose();
      geometry.dispose();
    },
  };
}

/** Parses the id key back into ids: the key (a primitive) is what keeps the entries stable while `tiles` changes identity. */
function parseTileIdsKey(key: string): number[] {
  return key === '' ? [] : key.split(',').map(Number);
}

/**
 * The highlight resources for a set of tiles: one instance for as long as the tile ids and the motion controller are the
 * same, however often the tile array or its objects are recreated, disposed when they change or the owner unmounts.
 */
export function useTileImpactHighlightResources(
  tiles: readonly BoardTileRenderModel[],
): TileImpactHighlightResources {
  const tileIdsKey = tiles.map(tile => tile.tileId).join(',');
  const entries = useMemo(() => getTileImpactHighlightEntriesForIds(parseTileIdsKey(tileIdsKey)), [tileIdsKey]);
  const motionController = useTileMotionController();
  const resources = useMemo(
    () => createTileImpactHighlightResources(entries, motionController),
    [entries, motionController],
  );
  useLayoutEffect(() => () => resources.dispose(), [resources]);
  return resources;
}

export default function TileImpactHighlightBatch({
  tiles,
}: TileImpactHighlightBatchProps) {
  const motionController = useTileMotionController();
  const resources = useTileImpactHighlightResources(tiles);

  useFrame(() => {
    resources.sync(motionController);
  });

  return <primitive object={resources.mesh} dispose={null} />;
}
