import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Tile } from '@monopoly/shared';
import {
  PROPERTY_ACCENT_HEIGHT,
  TILE_SURFACE_CLEARANCE_Y,
  TILE_SURFACE_INSET,
} from '../boardLayout';
import { getBoardTileLayout, transformTileLocalPointToWorld } from '../boardLayout';
import { composeTileSurfaceMatrix } from '../architecture/tileMatrix';
import type { BoardTileRenderModel } from '../boardRenderModel';
import { tileState } from '@monopoly/shared';
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
  tile: Tile;
  size: readonly [number, number];
  surfaceSize: readonly [number, number];
  isProperty: boolean;
}

function stopPointerEvent(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

export default function TileSurfaceBatch({
  tiles,
  onHover,
  onSelect,
}: TileSurfaceBatchProps) {
  const surfaceRef = useRef<THREE.InstancedMesh>(null);
  const accentRef = useRef<THREE.InstancedMesh>(null);
  const motionController = useTileMotionController();
  const motionRevision = useTileMotionRevision();
  const entries = useMemo(() => tiles.map(tile => {
    const layout = getBoardTileLayout(tile.tileId);
    const sourceTile = tileState[tile.tileId];
    if (!layout || !sourceTile) return null;
    return {
      tileId: tile.tileId,
      tile: sourceTile,
      size: layout.size,
      surfaceSize: [
        Math.max(0.3, layout.size[0] - TILE_SURFACE_INSET),
        Math.max(0.3, layout.size[1] - TILE_SURFACE_INSET),
      ] as const,
      isProperty: sourceTile.tileType === 'normal',
    } satisfies BatchEntry;
  }).filter((entry): entry is BatchEntry => entry !== null), [tiles]);
  useEffect(() => {
    const surfaceMesh = surfaceRef.current;
    const accentMesh = accentRef.current;
    if (!surfaceMesh || !accentMesh) return;
    const dummy = new THREE.Object3D();
    const surfaceMatrix = new THREE.Matrix4();
    entries.forEach((entry, index) => {
      const layout = getBoardTileLayout(entry.tileId);
      if (!layout) return;
      const tileOffsetY = motionController?.getTileOffsetY(entry.tileId) ?? 0;
      composeTileSurfaceMatrix(layout, entry.surfaceSize, tileOffsetY, surfaceMatrix);
      surfaceMesh.setMatrixAt(index, surfaceMatrix);

      if (!entry.isProperty) return;
      const accentIndex = entries.slice(0, index + 1).filter(candidate => candidate.isProperty).length - 1;
      const accentPosition = transformTileLocalPointToWorld(entry.tileId, [
        0,
        TILE_SURFACE_CLEARANCE_Y + PROPERTY_ACCENT_HEIGHT / 2 + tileOffsetY,
        -entry.surfaceSize[1] / 2 + 0.18,
      ]);
      if (!accentPosition) return;
      dummy.position.set(accentPosition[0], accentPosition[1], accentPosition[2]);
      dummy.rotation.set(0, layout.rotation[1], 0);
      dummy.scale.set(entry.surfaceSize[0] * 0.9, PROPERTY_ACCENT_HEIGHT, Math.min(0.24, entry.surfaceSize[1] * 0.16));
      dummy.updateMatrix();
      accentMesh.setMatrixAt(accentIndex, dummy.matrix);
    });
    surfaceMesh.instanceMatrix.needsUpdate = true;
    accentMesh.instanceMatrix.needsUpdate = true;
  }, [entries, motionController, motionRevision]);

  const handlePointer = (callback: ((tileId: number) => void) | undefined) => (event: ThreeEvent<PointerEvent | MouseEvent>) => {
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
        <meshStandardMaterial color={boardVisualTokens.tileSurface} side={THREE.DoubleSide} roughness={0.58} metalness={0} />
      </instancedMesh>
      <instancedMesh
        ref={accentRef}
        args={[undefined, undefined, entries.filter(entry => entry.isProperty).length]}
        name="PropertyAccentBands"
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={boardVisualTokens.tileTrim} roughness={0.3} metalness={0.05} />
      </instancedMesh>
    </group>
  );
}
