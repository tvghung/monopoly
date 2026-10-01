import { colorGroups } from '@monopoly/shared';
import * as THREE from 'three';
import type { BoardTileRenderModel } from '../board/boardRenderModel';
import { getPlayerDisplayColor } from '../../ui/playerVisualColors';
import { kitOpaqueMaterial } from './kit/kitMaterials';
import {
  buildTubeHouseBody,
  buildTubeHouseRoof,
  buildTubeHouseTrim,
  getTubeHouseFacadeColor,
} from './tubeHouseGeometry';
import { MAX_TUBE_HOUSES, getTubeHouseWorldPlacement, type TubeHousePoint } from './tubeHouseLayout';

/** The 22 buildable streets. */
export const STREET_TILE_IDS: readonly number[] = Object.values(colorGroups).flat();
const STREET_TILE_SET: ReadonlySet<number> = new Set(STREET_TILE_IDS);

/** Every street at four houses: the most instances the three meshes ever hold. */
export const MAX_TUBE_HOUSE_INSTANCES = STREET_TILE_IDS.length * MAX_TUBE_HOUSES;

export interface TubeHouseEntry {
  /** `tileId:slot`, stable while the house stays where it is. */
  key: string;
  tileId: number;
  slot: number;
  /** Houses in the row this one belongs to. */
  count: number;
  /** The owner's player color id (`red`, `blue`, ...), or undefined for a house nobody owns. */
  ownerColor?: string;
  facadeColor: string;
  position: TubeHousePoint;
  rotationY: number;
}

/**
 * One entry per visible house. A street at the hotel tier has no houses, except while the 4 → 5 transition plays: then its
 * four houses shrink away, so they are listed for the tiles in `hotelTransitionTiles`.
 */
export function buildTubeHouseEntries(
  tiles: readonly BoardTileRenderModel[],
  hotelTransitionTiles: ReadonlySet<number> = new Set(),
): TubeHouseEntry[] {
  const entries: TubeHouseEntry[] = [];
  for (const tile of tiles) {
    if (!STREET_TILE_SET.has(tile.tileId)) continue;
    const count = tile.houses === 5 && hotelTransitionTiles.has(tile.tileId)
      ? MAX_TUBE_HOUSES
      : Math.min(MAX_TUBE_HOUSES, tile.houses);
    if (count < 1 || (tile.houses === 5 && !hotelTransitionTiles.has(tile.tileId))) continue;
    for (let slot = 0; slot < count; slot += 1) {
      const placement = getTubeHouseWorldPlacement(tile.tileId, slot, count);
      if (!placement) continue;
      entries.push({
        key: `${tile.tileId}:${slot}`,
        tileId: tile.tileId,
        slot,
        count,
        ownerColor: tile.ownerColor,
        facadeColor: getTubeHouseFacadeColor(tile.tileId, slot),
        position: placement.position,
        rotationY: placement.rotationY,
      });
    }
  }
  return entries;
}

export function sameTubeHouseEntries(left: readonly TubeHouseEntry[], right: readonly TubeHouseEntry[]): boolean {
  return left.length === right.length && left.every((entry, index) => {
    const other = right[index];
    return entry.key === other.key
      && entry.count === other.count
      && entry.ownerColor === other.ownerColor
      && entry.facadeColor === other.facadeColor;
  });
}

const scratch = {
  matrix: new THREE.Matrix4(),
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  euler: new THREE.Euler(),
  scale: new THREE.Vector3(),
};

/** World matrix of one house: its foot, the tile heading and a uniform scale about the foot (the pop animation). */
export function composeTubeHouseMatrix(
  entry: TubeHouseEntry,
  scale: number,
  offsetY: number,
  target: THREE.Matrix4 = scratch.matrix,
): THREE.Matrix4 {
  scratch.position.set(entry.position[0], entry.position[1] + offsetY, entry.position[2]);
  scratch.quaternion.setFromEuler(scratch.euler.set(0, entry.rotationY, 0));
  scratch.scale.setScalar(scale);
  return target.compose(scratch.position, scratch.quaternion, scratch.scale);
}

export interface TubeHouseMeshes {
  body: THREE.InstancedMesh;
  trim: THREE.InstancedMesh;
  roof: THREE.InstancedMesh;
  geometries: THREE.BufferGeometry[];
}

function createInstanced(geometry: THREE.BufferGeometry, name: string): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, kitOpaqueMaterial, MAX_TUBE_HOUSE_INSTANCES);
  mesh.name = name;
  mesh.count = 0;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // The instances are spread over the whole board and move with their tiles: the default bounds would cull them wrongly.
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

/** The three instanced meshes of every house of the board: bodies, trim and roofs (3 draws, 3 shadow draws). */
export function createTubeHouseMeshes(): TubeHouseMeshes {
  const bodyGeometry = buildTubeHouseBody();
  const trimGeometry = buildTubeHouseTrim();
  const roofGeometry = buildTubeHouseRoof();
  return {
    body: createInstanced(bodyGeometry, 'TubeHouseBodies'),
    trim: createInstanced(trimGeometry, 'TubeHouseTrim'),
    roof: createInstanced(roofGeometry, 'TubeHouseRoofs'),
    geometries: [bodyGeometry, trimGeometry, roofGeometry],
  };
}

const NEUTRAL_ROOF = new THREE.Color('#6E5A4B');
const colorScratch = new THREE.Color();

/** Writes the facade pastel of every body and the owner's color of every roof. */
export function applyTubeHouseColors(meshes: TubeHouseMeshes, entries: readonly TubeHouseEntry[]): void {
  entries.forEach((entry, index) => {
    meshes.body.setColorAt(index, colorScratch.set(entry.facadeColor));
    meshes.roof.setColorAt(index, entry.ownerColor
      ? colorScratch.set(getPlayerDisplayColor(entry.ownerColor))
      : NEUTRAL_ROOF);
  });
  for (const mesh of [meshes.body, meshes.roof]) {
    mesh.count = entries.length;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  meshes.trim.count = entries.length;
}

/** Writes the matrix of every house; `scaleOf` and `offsetYOf` are the animation and the tile press, both per entry. */
export function writeTubeHouseMatrices(
  meshes: TubeHouseMeshes,
  entries: readonly TubeHouseEntry[],
  scaleOf: (entry: TubeHouseEntry, index: number) => number,
  offsetYOf: (tileId: number) => number,
): void {
  entries.forEach((entry, index) => {
    const matrix = composeTubeHouseMatrix(entry, scaleOf(entry, index), offsetYOf(entry.tileId));
    meshes.body.setMatrixAt(index, matrix);
    meshes.trim.setMatrixAt(index, matrix);
    meshes.roof.setMatrixAt(index, matrix);
  });
  for (const mesh of [meshes.body, meshes.trim, meshes.roof]) mesh.instanceMatrix.needsUpdate = true;
}

export function disposeTubeHouseMeshes(meshes: TubeHouseMeshes): void {
  for (const geometry of meshes.geometries) geometry.dispose();
  for (const mesh of [meshes.body, meshes.trim, meshes.roof]) mesh.dispose();
}
