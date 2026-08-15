import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tileState } from '@monopoly/shared';
import {
  TILE_SURFACE_INSET,
  TILE_SURFACE_LOCAL_POSITION,
  getBoardTileLayout,
} from '../boardLayout';
import {
  composeTileLocalPlaneMatrix,
  composeTileSurfaceMatrix,
} from '../architecture/tileMatrix';
import {
  getDistrictSurfaceDescriptor,
  type DistrictSurfaceKey,
} from '../architecture/tileVisualRegistry';
import type { BoardTileRenderModel } from '../boardRenderModel';
import { boardVisualTokens } from '../boardVisualTokens';
import { useTileMotionController, useTileMotionRevision } from '../motion/TileMotionProvider';

interface TileSurfaceBatchProps {
  tiles: readonly BoardTileRenderModel[];
  hoveredTileId?: number | null;
  selectedTileId?: number | null;
  onHover?: (tileId: number | null) => void;
  onSelect?: (tileId: number) => void;
}

interface BatchEntry {
  tileId: number;
  size: readonly [number, number];
  surfaceSize: readonly [number, number];
  districtSurfaceKey?: DistrictSurfaceKey;
  accentColor?: string;
}

interface AccentBatch {
  surfaceKey: DistrictSurfaceKey;
  color: string;
  entries: readonly BatchEntry[];
}

function stopPointerEvent(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

function PropertyAccentInlayBatch({ batch }: { batch: AccentBatch }) {
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
      const accentDepth = Math.min(0.075, entry.surfaceSize[1] * 0.05);
      composeTileLocalPlaneMatrix(
        layout,
        [entry.surfaceSize[0] * 0.44, accentDepth],
        [0, -entry.surfaceSize[1] / 2 + 0.14],
        TILE_SURFACE_LOCAL_POSITION[1] + motionOffsetY + 0.003,
        matrix,
      );
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [batch, motionController, motionRevision]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, batch.entries.length]}
      name={`PropertyAccentInlays:${batch.surfaceKey}`}
      userData={{ districtSurfaceKey: batch.surfaceKey }}
    >
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial color={batch.color} roughness={0.52} metalness={0} />
    </instancedMesh>
  );
}

export default function TileSurfaceBatch({
  tiles,
  onHover,
  onSelect,
}: TileSurfaceBatchProps) {
  const surfaceRef = useRef<THREE.InstancedMesh>(null);
  const motionController = useTileMotionController();
  const motionRevision = useTileMotionRevision();
  const entries = useMemo(() => tiles.map<BatchEntry | null>(tile => {
    const layout = getBoardTileLayout(tile.tileId);
    const sourceTile = tileState[tile.tileId];
    if (!layout || !sourceTile) return null;
    const district = getDistrictSurfaceDescriptor(sourceTile);
    return {
      tileId: tile.tileId,
      size: layout.size,
      surfaceSize: [
        Math.max(0.3, layout.size[0] - TILE_SURFACE_INSET),
        Math.max(0.3, layout.size[1] - TILE_SURFACE_INSET),
      ] as const,
      districtSurfaceKey: district?.surfaceKey,
      accentColor: district?.accentColor,
    } satisfies BatchEntry;
  }).filter((entry): entry is BatchEntry => entry !== null), [tiles]);
  const accentBatches = useMemo(() => {
    const bySurfaceKey = new Map<DistrictSurfaceKey, BatchEntry[]>();
    entries.forEach(entry => {
      if (!entry.districtSurfaceKey || !entry.accentColor) return;
      const group = bySurfaceKey.get(entry.districtSurfaceKey) ?? [];
      group.push(entry);
      bySurfaceKey.set(entry.districtSurfaceKey, group);
    });
    return [...bySurfaceKey.entries()].map(([surfaceKey, groupedEntries]): AccentBatch => ({
      surfaceKey,
      color: groupedEntries[0].accentColor!,
      entries: groupedEntries,
    }));
  }, [entries]);

  useEffect(() => {
    const surfaceMesh = surfaceRef.current;
    if (!surfaceMesh) return;
    const surfaceMatrix = new THREE.Matrix4();
    entries.forEach((entry, index) => {
      const layout = getBoardTileLayout(entry.tileId);
      if (!layout) return;
      const tileOffsetY = motionController?.getTileOffsetY(entry.tileId) ?? 0;
      composeTileSurfaceMatrix(layout, entry.surfaceSize, tileOffsetY, surfaceMatrix);
      surfaceMesh.setMatrixAt(index, surfaceMatrix);
    });
    surfaceMesh.instanceMatrix.needsUpdate = true;
  }, [entries, motionController, motionRevision]);

  const handlePointer = (callback: ((tileId: number) => void) | undefined) => (
    event: ThreeEvent<PointerEvent | MouseEvent>,
  ) => {
    stopPointerEvent(event);
    const instanceId = event.instanceId;
    if (instanceId === undefined) return;
    const entry = entries[instanceId];
    if (entry) callback?.(entry.tileId);
  };

  return (
    <group name="TileSurfaceBatch">
      <instancedMesh
        ref={surfaceRef}
        args={[undefined, undefined, entries.length]}
        name="TileSurfaces"
        onPointerEnter={handlePointer(tileId => onHover?.(tileId))}
        onPointerLeave={event => { stopPointerEvent(event); onHover?.(null); }}
        onClick={handlePointer(tileId => onSelect?.(tileId))}
      >
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial
          color={boardVisualTokens.tileSurface}
          side={THREE.DoubleSide}
          roughness={0.58}
          metalness={0}
        />
      </instancedMesh>
      {accentBatches.map(batch => (
        <PropertyAccentInlayBatch key={batch.surfaceKey} batch={batch} />
      ))}
    </group>
  );
}
