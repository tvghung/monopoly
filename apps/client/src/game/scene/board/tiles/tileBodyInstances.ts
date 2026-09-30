import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { tileState } from '@monopoly/shared';
import {
  BOARD_FOUNDATION_HEIGHT,
  TILE_BODY_BEVEL,
  TILE_BODY_HEIGHT,
  TILE_SOCKET_GAP,
} from '../architecture/boardArtSpec';
import { getBoardTileLayout } from '../boardLayout';
import type { BoardTileRenderModel } from '../boardRenderModel';
import { boardVisualTokens } from '../boardVisualTokens';
import { getBoardMaterialProps } from '../materials/boardMaterialSpecs';

export interface BodyEntry {
  tileId: number;
  size: readonly [number, number];
  baseColor: string;
}

export const TILE_BODY_CENTER_Y = BOARD_FOUNDATION_HEIGHT + TILE_SOCKET_GAP + TILE_BODY_HEIGHT / 2;

export function createTileBodyGeometry(): THREE.BufferGeometry {
  return new RoundedBoxGeometry(1, TILE_BODY_HEIGHT, 1, 2, TILE_BODY_BEVEL);
}

export function buildBodyEntries(tiles: readonly BoardTileRenderModel[]): BodyEntry[] {
  return tiles.map<BodyEntry | null>(tile => {
    const layout = getBoardTileLayout(tile.tileId);
    const sourceTile = tileState[tile.tileId];
    if (!layout || !sourceTile) return null;
    return {
      tileId: tile.tileId,
      size: layout.size,
      baseColor: sourceTile.tileType === 'normal'
        ? boardVisualTokens.tileChassis
        : boardVisualTokens.tileChassisSpecial,
    } satisfies BodyEntry;
  }).filter((entry): entry is BodyEntry => entry !== null);
}

/** Two entry lists describe the same bodies when their ids, sizes and base colors match. */
export function sameBodyEntries(left: readonly BodyEntry[], right: readonly BodyEntry[]): boolean {
  return left.length === right.length && left.every((entry, index) => {
    const other = right[index];
    return entry.tileId === other.tileId
      && entry.baseColor === other.baseColor
      && entry.size[0] === other.size[0]
      && entry.size[1] === other.size[1];
  });
}

/** Selection wins over hover; everything else keeps its base color. */
export function tileBodyColor(
  entry: BodyEntry,
  hoveredTileId: number | null,
  selectedTileId: number | null,
): string {
  if (entry.tileId === selectedTileId) return boardVisualTokens.tileChassisSelected;
  if (entry.tileId === hoveredTileId) return boardVisualTokens.tileChassisHover;
  return entry.baseColor;
}

const scratchColor = new THREE.Color();

function writeBodyColor(mesh: THREE.InstancedMesh, index: number, color: string): boolean {
  scratchColor.set(color);
  const current = mesh.instanceColor;
  if (
    current
    // The attribute stores float32, so compare against the float32 rounding of the target color.
    && current.getX(index) === Math.fround(scratchColor.r)
    && current.getY(index) === Math.fround(scratchColor.g)
    && current.getZ(index) === Math.fround(scratchColor.b)
  ) return false;
  mesh.setColorAt(index, scratchColor);
  return true;
}

/**
 * One instanced mesh with one material for every tile body. Base, hover and selected looks are
 * per-instance colors, so hover and selection never allocate geometry or materials (and never force a
 * shader recompile once shadows are on).
 */
export function createTileBodyMesh(
  entries: readonly BodyEntry[],
  geometry: THREE.BufferGeometry,
): THREE.InstancedMesh {
  const material = new THREE.MeshStandardMaterial({ ...getBoardMaterialProps('tileChassis', '#ffffff') });
  const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
  mesh.name = 'TileBodies';
  const dummy = new THREE.Object3D();
  entries.forEach((entry, index) => {
    const layout = getBoardTileLayout(entry.tileId);
    if (!layout) return;
    dummy.position.set(layout.position[0], TILE_BODY_CENTER_Y, layout.position[2]);
    dummy.rotation.set(0, layout.rotation[1], 0);
    dummy.scale.set(entry.size[0], 1, entry.size[1]);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    writeBodyColor(mesh, index, entry.baseColor);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/** Re-colors the instances for the current hover/selection. Returns whether anything changed. */
export function applyTileBodyColors(
  mesh: THREE.InstancedMesh,
  entries: readonly BodyEntry[],
  hoveredTileId: number | null,
  selectedTileId: number | null,
): boolean {
  let changed = false;
  entries.forEach((entry, index) => {
    if (writeBodyColor(mesh, index, tileBodyColor(entry, hoveredTileId, selectedTileId))) changed = true;
  });
  if (changed && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return changed;
}

const offsetScratch = new THREE.Object3D();

/**
 * Applies the current per-tile vertical motion offsets to the instance matrices. Only tiles whose
 * offset changed since the last call are rewritten; returns whether any matrix changed.
 */
export function syncTileBodyOffsets(
  mesh: THREE.InstancedMesh,
  entries: readonly BodyEntry[],
  getOffsetY: (tileId: number) => number,
  previousOffsets: Map<number, number>,
): boolean {
  let changed = false;
  entries.forEach((entry, index) => {
    const layout = getBoardTileLayout(entry.tileId);
    if (!layout) return;
    const offsetY = getOffsetY(entry.tileId);
    if (previousOffsets.get(entry.tileId) === offsetY) return;
    offsetScratch.position.set(layout.position[0], TILE_BODY_CENTER_Y + offsetY, layout.position[2]);
    offsetScratch.rotation.set(0, layout.rotation[1], 0);
    offsetScratch.scale.set(entry.size[0], 1, entry.size[1]);
    offsetScratch.updateMatrix();
    mesh.setMatrixAt(index, offsetScratch.matrix);
    previousOffsets.set(entry.tileId, offsetY);
    changed = true;
  });
  if (changed) mesh.instanceMatrix.needsUpdate = true;
  return changed;
}
