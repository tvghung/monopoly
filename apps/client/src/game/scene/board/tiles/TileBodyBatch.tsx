import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  useEffect, useLayoutEffect, useMemo, useRef,
} from 'react';
import type { BoardTileRenderModel } from '../boardRenderModel';
import { useTileMotionController } from '../motion/TileMotionProvider';
import {
  applyTileBodyColors,
  buildBodyEntries,
  createTileBodyGeometry,
  createTileBodyMesh,
  sameBodyEntries,
  syncTileBodyOffsets,
  type BodyEntry,
} from './tileBodyInstances';

interface TileBodyBatchProps {
  tiles: readonly BoardTileRenderModel[];
  hoveredTileId?: number | null;
  selectedTileId?: number | null;
  onHover?: (tileId: number | null) => void;
  onSelect?: (tileId: number) => void;
}

function stopPointerEvent(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

/** The render model changes identity often; the bodies only change when the tile set does. */
function useStableBodyEntries(next: BodyEntry[]): BodyEntry[] {
  const ref = useRef(next);
  if (!sameBodyEntries(ref.current, next)) ref.current = next;
  return ref.current;
}

export default function TileBodyBatch({
  tiles,
  hoveredTileId = null,
  selectedTileId = null,
  onHover,
  onSelect,
}: TileBodyBatchProps) {
  const invalidate = useThree(state => state.invalidate);
  const rawEntries = useMemo(() => buildBodyEntries(tiles), [tiles]);
  const entries = useStableBodyEntries(rawEntries);
  const geometry = useMemo(() => createTileBodyGeometry(), []);
  const mesh = useMemo(() => createTileBodyMesh(entries, geometry), [entries, geometry]);
  const motionController = useTileMotionController();
  const previousOffsetsRef = useRef(new Map<number, number>());

  // Hover and selection only rewrite instance colors on the one stable mesh.
  useLayoutEffect(() => {
    if (applyTileBodyColors(mesh, entries, hoveredTileId, selectedTileId)) invalidate();
  }, [entries, hoveredTileId, invalidate, mesh, selectedTileId]);

  useFrame(() => {
    syncTileBodyOffsets(mesh, entries, tileId => motionController?.getTileOffsetY(tileId) ?? 0, previousOffsetsRef.current);
  });

  useEffect(() => () => {
    if (Array.isArray(mesh.material)) mesh.material.forEach(material => material.dispose());
    else mesh.material.dispose();
    previousOffsetsRef.current.clear();
  }, [mesh]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group name="TileBodyBatch">
      <primitive
        object={mesh}
        userData={{ tileIds: entries.map(entry => entry.tileId) }}
        onPointerEnter={(event: ThreeEvent<PointerEvent>) => {
          stopPointerEvent(event);
          const entry = event.instanceId === undefined ? undefined : entries[event.instanceId];
          if (entry) onHover?.(entry.tileId);
        }}
        onPointerLeave={(event: ThreeEvent<PointerEvent>) => {
          stopPointerEvent(event);
          onHover?.(null);
        }}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          stopPointerEvent(event);
          const entry = event.instanceId === undefined ? undefined : entries[event.instanceId];
          if (entry) onSelect?.(entry.tileId);
        }}
        dispose={null}
      />
    </group>
  );
}
