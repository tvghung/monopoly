import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { tileState } from '@monopoly/shared';
import {
  BOARD_FOUNDATION_HEIGHT,
  TILE_BODY_BEVEL,
  TILE_BODY_HEIGHT,
  TILE_SOCKET_GAP,
} from '../architecture/boardArtSpec';
import { getBoardTileLayout } from '../boardLayout';
import { getTileVisualDescriptor } from '../architecture/tileVisualRegistry';
import type { BoardTileRenderModel } from '../boardRenderModel';
import { boardVisualTokens } from '../boardVisualTokens';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

interface TileBodyBatchProps {
  tiles: readonly BoardTileRenderModel[];
  hoveredTileId?: number | null;
  selectedTileId?: number | null;
  onHover?: (tileId: number | null) => void;
  onSelect?: (tileId: number) => void;
}

interface BodyEntry {
  tileId: number;
  size: readonly [number, number];
  baseColor: string;
}

interface BodyBatch {
  color: string;
  entries: readonly BodyEntry[];
  mesh: THREE.InstancedMesh;
  material: THREE.MeshStandardMaterial;
}

function stopPointerEvent(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

export default function TileBodyBatch({
  tiles,
  hoveredTileId = null,
  selectedTileId = null,
  onHover,
  onSelect,
}: TileBodyBatchProps) {
  const entries = useMemo(() => tiles.map(tile => {
    const layout = getBoardTileLayout(tile.tileId);
    const sourceTile = tileState[tile.tileId];
    if (!layout || !sourceTile) return null;
    return {
      tileId: tile.tileId,
      size: layout.size,
      baseColor: sourceTile.tileType === 'normal'
        ? getTileVisualDescriptor(sourceTile).primaryColor
        : boardVisualTokens.tileBodyLower,
    } satisfies BodyEntry;
  }).filter((entry): entry is BodyEntry => entry !== null), [tiles]);
  const geometry = useMemo(
    () => new RoundedBoxGeometry(1, TILE_BODY_HEIGHT, 1, 2, TILE_BODY_BEVEL),
    [],
  );
  const batches = useMemo(() => {
    const byColor = new Map<string, BodyEntry[]>();
    entries.forEach(entry => {
      const color = entry.tileId === selectedTileId
        ? boardVisualTokens.selection
        : entry.tileId === hoveredTileId
          ? boardVisualTokens.hover
          : entry.baseColor;
      const group = byColor.get(color) ?? [];
      group.push(entry);
      byColor.set(color, group);
    });
    const bodyCenterY = BOARD_FOUNDATION_HEIGHT + TILE_SOCKET_GAP + TILE_BODY_HEIGHT / 2;
    return [...byColor.entries()].map(([color, groupedEntries], batchIndex): BodyBatch => {
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.01 });
      const mesh = new THREE.InstancedMesh(geometry, material, groupedEntries.length);
      mesh.name = `TileBodies:${batchIndex}`;
      const dummy = new THREE.Object3D();
      groupedEntries.forEach((entry, index) => {
        const layout = getBoardTileLayout(entry.tileId);
        if (!layout) return;
        dummy.position.set(layout.position[0], bodyCenterY, layout.position[2]);
        dummy.rotation.set(0, layout.rotation[1], 0);
        dummy.scale.set(entry.size[0], 1, entry.size[1]);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      return { color, entries: groupedEntries, mesh, material };
    });
  }, [entries, geometry, hoveredTileId, selectedTileId]);

  useEffect(() => () => {
    batches.forEach(batch => batch.material.dispose());
  }, [batches]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group name="TileBodyBatch">
      {batches.map(batch => (
        <primitive
          key={batch.mesh.uuid}
          object={batch.mesh}
          userData={{ batchColor: batch.color, tileIds: batch.entries.map(entry => entry.tileId) }}
          onPointerEnter={(event: ThreeEvent<PointerEvent>) => {
            stopPointerEvent(event);
            const entry = event.instanceId === undefined ? undefined : batch.entries[event.instanceId];
            if (entry) onHover?.(entry.tileId);
          }}
          onPointerLeave={(event: ThreeEvent<PointerEvent>) => {
            stopPointerEvent(event);
            onHover?.(null);
          }}
          onClick={(event: ThreeEvent<MouseEvent>) => {
            stopPointerEvent(event);
            const entry = event.instanceId === undefined ? undefined : batch.entries[event.instanceId];
            if (entry) onSelect?.(entry.tileId);
          }}
          dispose={null}
        />
      ))}
    </group>
  );
}
