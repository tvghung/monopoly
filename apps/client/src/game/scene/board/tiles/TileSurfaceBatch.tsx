import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { tileState } from '@monopoly/shared';
import { getBoardTileLayout, getTileSurfaceGeometry, type BoardSide } from '../boardLayout';
import { composeTileSurfaceMatrix } from '../architecture/tileMatrix';
import {
  DISTRICT_SURFACE_KEYS,
  getDistrictSurfaceDescriptor,
  type DistrictSurfaceKey,
} from '../architecture/tileVisualRegistry';
import { getTileTextureAnisotropy } from '../architecture/sceneBudget';
import type { BoardTileRenderModel } from '../boardRenderModel';
import { DistrictSurfaceMaterialLibrary } from '../materials/districtSurfaceMaterials';
import {
  WHITE_PEBBLE_VARIANTS,
  getWhitePebbleVariant,
  type WhitePebbleVariant,
} from '../materials/whitePebbleSurface';
import { getTilePanelLayout } from './tilePanelLayout';
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
  side: BoardSide;
  surfaceSize: readonly [number, number];
  surfaceKey?: DistrictSurfaceKey;
  surfacePlaneOffset?: number;
}

export type WhitePebbleBatchKey =
  | `specialPebble${WhitePebbleVariant}`
  | `footerPebble${WhitePebbleVariant}`;

export type TileSurfaceBatchKey = DistrictSurfaceKey | WhitePebbleBatchKey | 'divider';

export interface TileSurfaceBatchGroup {
  key: TileSurfaceBatchKey;
  entries: readonly TileSurfaceBatchEntry[];
}

function getWhitePebbleBatchKey(
  prefix: 'specialPebble' | 'footerPebble',
  variant: WhitePebbleVariant,
): WhitePebbleBatchKey {
  return `${prefix}${variant}` as WhitePebbleBatchKey;
}

export function getWhitePebbleBatchVariant(
  key: TileSurfaceBatchKey,
): WhitePebbleVariant | null {
  if (!key.startsWith('specialPebble') && !key.startsWith('footerPebble')) return null;
  return Number(key.slice(-1)) as WhitePebbleVariant;
}

export function groupTileSurfaceEntries(
  entries: readonly TileSurfaceBatchEntry[],
): readonly TileSurfaceBatchGroup[] {
  const districtGroups = DISTRICT_SURFACE_KEYS.map(key => ({
    key,
    entries: entries.filter(entry => entry.surfaceKey === key),
  })).filter(group => group.entries.length > 0);
  const specialEntries = entries.filter(entry => entry.surfaceKey === undefined);
  const specialGroups = WHITE_PEBBLE_VARIANTS.map(variant => ({
    key: getWhitePebbleBatchKey('specialPebble', variant),
    entries: specialEntries.filter(entry => getWhitePebbleVariant(entry.tileId) === variant),
  })).filter(group => group.entries.length > 0);
  return [...districtGroups, ...specialGroups];
}

export function groupTileFooterEntries(
  entries: readonly TileSurfaceBatchEntry[],
): readonly TileSurfaceBatchGroup[] {
  return WHITE_PEBBLE_VARIANTS.map(variant => ({
    key: getWhitePebbleBatchKey('footerPebble', variant),
    entries: entries.filter(entry => getWhitePebbleVariant(entry.tileId) === variant),
  })).filter(group => group.entries.length > 0);
}

function stopPointerEvent(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

function SurfaceBatchMesh({
  batch,
  geometry,
  material,
  layerName,
  onHover,
  onSelect,
}: {
  batch: TileSurfaceBatchGroup;
  geometry: THREE.PlaneGeometry;
  material: THREE.MeshStandardMaterial;
  layerName: string;
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
      composeTileSurfaceMatrix(
        layout,
        entry.surfaceSize,
        motionOffsetY,
        matrix,
        entry.surfacePlaneOffset ?? 0,
      );
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

  if (batch.entries.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, batch.entries.length]}
      name={`${layerName}:${batch.key}`}
      userData={{
        materialKey: batch.key,
        panel: layerName,
        tileIds: batch.entries.map(entry => entry.tileId),
        panelSides: batch.entries.map(entry => entry.side),
        panelFlowSigns: batch.entries.map(entry => getTilePanelLayout(entry.surfaceSize, entry.side).flowSign),
      }}
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

function getUpperMaterial(
  library: DistrictSurfaceMaterialLibrary,
  key: TileSurfaceBatchKey,
): THREE.MeshStandardMaterial {
  if (key === 'divider') throw new Error(`Panel key ${key} cannot use an upper material.`);
  const pebbleVariant = getWhitePebbleBatchVariant(key);
  if (pebbleVariant !== null) return library.getWhitePebbleMaterial(pebbleVariant);
  return library.getMaterial(key as DistrictSurfaceKey);
}

export function withPanel(
  entry: TileSurfaceBatchEntry,
  panel: 'upper' | 'footer' | 'divider',
): TileSurfaceBatchEntry {
  const panelLayout = getTilePanelLayout(entry.surfaceSize, entry.side);
  if (panel === 'upper') {
    return {
      ...entry,
      surfaceSize: panelLayout.upperSize,
      surfacePlaneOffset: panelLayout.upperPlaneOffset,
    };
  }
  if (panel === 'footer') {
    return {
      ...entry,
      surfaceSize: panelLayout.footerSize,
      surfacePlaneOffset: panelLayout.footerPlaneOffset,
    };
  }
  return {
    ...entry,
    surfaceSize: panelLayout.dividerSize,
    surfacePlaneOffset: panelLayout.dividerPlaneOffset,
  };
}

export function TileSurfaceUpperLayer({
  batches,
  library,
  geometry,
  onHover,
  onSelect,
}: {
  batches: readonly TileSurfaceBatchGroup[];
  library: DistrictSurfaceMaterialLibrary;
  geometry: THREE.PlaneGeometry;
  onHover?: (tileId: number | null) => void;
  onSelect?: (tileId: number) => void;
}) {
  return (
    <group name="TileSurfaceUpperLayer">
      {batches.map(batch => (
        <SurfaceBatchMesh
          key={`upper:${batch.key}`}
          batch={batch}
          geometry={geometry}
          material={getUpperMaterial(library, batch.key)}
          layerName="TileSurfaceUpperLayer"
          onHover={onHover}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

export function TileFooterLayer({
  batches,
  library,
  geometry,
  onHover,
  onSelect,
}: {
  batches: readonly TileSurfaceBatchGroup[];
  library: DistrictSurfaceMaterialLibrary;
  geometry: THREE.PlaneGeometry;
  onHover?: (tileId: number | null) => void;
  onSelect?: (tileId: number) => void;
}) {
  return (
    <group name="TileFooterLayer">
      {batches.map(batch => (
        <SurfaceBatchMesh
          key={`footer:${batch.key}`}
          batch={batch}
          geometry={geometry}
          material={library.getWhitePebbleMaterial(getWhitePebbleBatchVariant(batch.key)!)}
          layerName="TileFooterLayer"
          onHover={onHover}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

export function TileDividerLine({
  batch,
  library,
  geometry,
  onHover,
  onSelect,
}: {
  batch: TileSurfaceBatchGroup;
  library: DistrictSurfaceMaterialLibrary;
  geometry: THREE.PlaneGeometry;
  onHover?: (tileId: number | null) => void;
  onSelect?: (tileId: number) => void;
}) {
  return (
    <group name="TileDividerLine">
      <SurfaceBatchMesh
        batch={batch}
        geometry={geometry}
        material={library.dividerMaterial}
        layerName="TileDividerLine"
        onHover={onHover}
        onSelect={onSelect}
      />
    </group>
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
      side: layout.side,
      surfaceSize: getTileSurfaceGeometry(layout).size,
      surfaceKey: getDistrictSurfaceDescriptor(sourceTile)?.surfaceKey,
    } satisfies TileSurfaceBatchEntry;
  }).filter((entry): entry is TileSurfaceBatchEntry => entry !== null), [tiles]);

  const edgeEntries = useMemo(
    () => entries.filter(entry => getBoardTileLayout(entry.tileId)?.side !== 'CORNER'),
    [entries],
  );
  const cornerEntries = useMemo(
    () => entries.filter(entry => getBoardTileLayout(entry.tileId)?.side === 'CORNER'),
    [entries],
  );
  const upperEntries = useMemo(
    () => [...edgeEntries.map(entry => withPanel(entry, 'upper')), ...cornerEntries],
    [cornerEntries, edgeEntries],
  );
  const upperBatches = useMemo(
    () => groupTileSurfaceEntries(upperEntries),
    [upperEntries],
  );
  const footerBatches = useMemo(
    () => groupTileFooterEntries(edgeEntries.map(entry => withPanel(entry, 'footer'))),
    [edgeEntries],
  );
  const dividerBatch = useMemo<TileSurfaceBatchGroup>(() => ({
    key: 'divider',
    entries: edgeEntries.map(entry => withPanel(entry, 'divider')),
  }), [edgeEntries]);

  return (
    <group name="TileSurfaceBatch">
      <TileSurfaceUpperLayer
        batches={upperBatches}
        library={materialLibrary}
        geometry={materialLibrary.geometry}
        onHover={onHover}
        onSelect={onSelect}
      />
      <TileFooterLayer
        batches={footerBatches}
        library={materialLibrary}
        geometry={materialLibrary.geometry}
        onHover={onHover}
        onSelect={onSelect}
      />
      <TileDividerLine
        batch={dividerBatch}
        library={materialLibrary}
        geometry={materialLibrary.geometry}
        onHover={onHover}
        onSelect={onSelect}
      />
    </group>
  );
}
