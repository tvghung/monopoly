import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tileState } from '@monopoly/shared';
import { TILE_SURFACE_INSET, getBoardTileLayout } from '../boardLayout';
import { composeTileSurfaceMatrix } from '../architecture/tileMatrix';
import {
  DISTRICT_SURFACE_KEYS,
  getDistrictSurfaceDescriptor,
  type DistrictSurfaceKey,
} from '../architecture/tileVisualRegistry';
import { getTileTextureAnisotropy } from '../architecture/sceneBudget';
import type { BoardTileRenderModel } from '../boardRenderModel';
import { DistrictSurfaceMaterialLibrary } from '../materials/districtSurfaceMaterials';
import { useTileMotionController, useTileMotionRevision } from '../motion/TileMotionProvider';

interface TileSurfaceBatchProps {
  tiles: readonly BoardTileRenderModel[];
  hoveredTileId?: number | null;
  selectedTileId?: number | null;
  onHover?: (tileId: number | null) => void;
  onSelect?: (tileId: number) => void;
}

export interface TileSurfaceBatchEntry {
  tileId: number;
  surfaceSize: readonly [number, number];
  surfaceKey?: DistrictSurfaceKey;
}

export interface TileSurfaceBatchGroup {
  key: DistrictSurfaceKey | 'special';
  entries: readonly TileSurfaceBatchEntry[];
}

export function groupTileSurfaceEntries(
  entries: readonly TileSurfaceBatchEntry[],
): readonly TileSurfaceBatchGroup[] {
  const districtGroups = DISTRICT_SURFACE_KEYS.map(key => ({
    key,
    entries: entries.filter(entry => entry.surfaceKey === key),
  })).filter(group => group.entries.length > 0);
  const specialEntries = entries.filter(entry => entry.surfaceKey === undefined);
  return specialEntries.length > 0
    ? [...districtGroups, { key: 'special' as const, entries: specialEntries }]
    : districtGroups;
}

function stopPointerEvent(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

function SurfaceBatchMesh({
  batch,
  geometry,
  material,
  onHover,
  onSelect,
}: {
  batch: TileSurfaceBatchGroup;
  geometry: THREE.PlaneGeometry;
  material: THREE.MeshStandardMaterial;
  onHover?: (tileId: number | null) => void;
  onSelect?: (tileId: number) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const motionController = useTileMotionController();
  const motionRevision = useTileMotionRevision();

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    batch.entries.forEach((entry, index) => {
      const layout = getBoardTileLayout(entry.tileId);
      if (!layout) return;
      const motionOffsetY = motionController?.getTileOffsetY(entry.tileId) ?? 0;
      composeTileSurfaceMatrix(layout, entry.surfaceSize, motionOffsetY, matrix);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [batch, motionController, motionRevision]);

  const handlePointer = (callback: ((tileId: number) => void) | undefined) => (
    event: ThreeEvent<PointerEvent | MouseEvent>,
  ) => {
    stopPointerEvent(event);
    const instanceId = event.instanceId;
    if (instanceId === undefined) return;
    const entry = batch.entries[instanceId];
    if (entry) callback?.(entry.tileId);
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, batch.entries.length]}
      name={`TileSurfaces:${batch.key}`}
      userData={{ materialKey: batch.key, tileIds: batch.entries.map(entry => entry.tileId) }}
      onPointerEnter={handlePointer(tileId => onHover?.(tileId))}
      onPointerLeave={event => { stopPointerEvent(event); onHover?.(null); }}
      onClick={handlePointer(tileId => onSelect?.(tileId))}
      dispose={null}
    >
      <primitive object={geometry} attach="geometry" />
      <primitive object={material} attach="material" />
    </instancedMesh>
  );
}

export default function TileSurfaceBatch({
  tiles,
  onHover,
  onSelect,
}: TileSurfaceBatchProps) {
  const gl = useThree(state => state.gl);
  const anisotropy = getTileTextureAnisotropy(gl.capabilities.getMaxAnisotropy());
  const materialLibrary = useMemo(
    () => new DistrictSurfaceMaterialLibrary(anisotropy),
    [anisotropy],
  );
  useEffect(() => {
    materialLibrary.retain();
    return () => materialLibrary.release();
  }, [materialLibrary]);

  const entries = useMemo(() => tiles.map<TileSurfaceBatchEntry | null>(tile => {
    const layout = getBoardTileLayout(tile.tileId);
    const sourceTile = tileState[tile.tileId];
    if (!layout || !sourceTile) return null;
    return {
      tileId: tile.tileId,
      surfaceSize: [
        Math.max(0.3, layout.size[0] - TILE_SURFACE_INSET),
        Math.max(0.3, layout.size[1] - TILE_SURFACE_INSET),
      ] as const,
      surfaceKey: getDistrictSurfaceDescriptor(sourceTile)?.surfaceKey,
    } satisfies TileSurfaceBatchEntry;
  }).filter((entry): entry is TileSurfaceBatchEntry => entry !== null), [tiles]);
  const batches = useMemo(() => groupTileSurfaceEntries(entries), [entries]);

  return (
    <group name="TileSurfaceBatch">
      {batches.map(batch => (
        <SurfaceBatchMesh
          key={batch.key}
          batch={batch}
          geometry={materialLibrary.geometry}
          material={batch.key === 'special'
            ? materialLibrary.specialMaterial
            : materialLibrary.getMaterial(batch.key)}
          onHover={onHover}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}
