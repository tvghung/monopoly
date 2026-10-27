import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  memo, useEffect, useLayoutEffect, useMemo, useRef,
} from 'react';
import type { BoardTileRenderModel } from '../boardRenderModel';
import type { TileHoverStore } from '../tileHoverStore';
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
  powerUpTargets?: import('../../../presentation/store/types').PresentationState['powerUpTargets'];
  /** The hovered tile lives in a store, not in props: a hover repaints instance colours here and never re-renders the board. */
  hoverStore?: TileHoverStore;
  selectedTileId?: number | null;
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

function TileBodyBatch({
  tiles,
  powerUpTargets,
  hoverStore,
  selectedTileId = null,
  onSelect,
}: TileBodyBatchProps) {
  const invalidate = useThree(state => state.invalidate);
  const rawEntries = useMemo(() => buildBodyEntries(tiles), [tiles]);
  const entries = useStableBodyEntries(rawEntries);
  const geometry = useMemo(() => createTileBodyGeometry(), []);
  const mesh = useMemo(() => createTileBodyMesh(entries, geometry), [entries, geometry]);
  const motionController = useTileMotionController();
  const previousOffsetsRef = useRef(new Map<number, number>());
  const userData = useMemo(() => ({ tileIds: entries.map(entry => entry.tileId) }), [entries]);

  // Hover and selection only rewrite instance colors on the one stable mesh. Hover arrives through the store, so the pointer
  // crossing a tile costs one colour write and one frame, not a React render.
  useLayoutEffect(() => {
    const apply = () => {
      if (applyTileBodyColors(mesh, entries, hoverStore?.get() ?? null, selectedTileId, powerUpTargets)) invalidate();
    };
    apply();
    return hoverStore?.subscribe(apply);
  }, [entries, hoverStore, invalidate, mesh, selectedTileId, powerUpTargets]);

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
        userData={userData}
        onPointerEnter={(event: ThreeEvent<PointerEvent>) => {
          stopPointerEvent(event);
          const entry = event.instanceId === undefined ? undefined : entries[event.instanceId];
          if (entry) hoverStore?.set(entry.tileId);
        }}
        onPointerLeave={(event: ThreeEvent<PointerEvent>) => {
          stopPointerEvent(event);
          hoverStore?.set(null);
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

export default memo(TileBodyBatch);
