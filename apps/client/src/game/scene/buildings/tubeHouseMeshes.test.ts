import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { DevelopmentChangeSignal } from '../../presentation/store/types';
import type { BoardTileRenderModel } from '../board/boardRenderModel';
import { getPlayerDisplayColor } from '../../ui/playerVisualColors';
import { getHouseScale, planHouseAnimations } from './tubeHouseAnimation';
import {
  MAX_TUBE_HOUSE_INSTANCES,
  STREET_TILE_IDS,
  applyTubeHouseColors,
  buildTubeHouseEntries,
  composeTubeHouseMatrix,
  createTubeHouseMeshes,
  disposeTubeHouseMeshes,
  sameTubeHouseEntries,
  writeTubeHouseMatrices,
} from './tubeHouseMeshes';
import { getTubeHouseFacadeColor } from './tubeHouseGeometry';
import { triangleCount } from './kit/lowPolyKit';

function tile(tileId: number, houses: number, ownerColor?: string): BoardTileRenderModel {
  return { tileId, name: `Tile ${tileId}`, tileType: 'normal', price: 100, propertyColor: 'brown', houses, ownerColor };
}

function change(overrides: Partial<DevelopmentChangeSignal>): DevelopmentChangeSignal {
  return {
    id: 'change-1', sequence: 1, consequenceOrder: 0, tileId: 1, playerId: 'player-a',
    fromHouses: 0, toHouses: 2, delta: 2, direction: 'UP', durationMs: 1000, ...overrides,
  };
}

describe('tube house entries', () => {
  it('lists one entry per visible house of the streets, in a row per tile', () => {
    const entries = buildTubeHouseEntries([tile(1, 2, 'red'), tile(3, 4, 'blue'), tile(6, 0), tile(5, 3, 'green')]);
    expect(entries.map(entry => entry.key)).toEqual(['1:0', '1:1', '3:0', '3:1', '3:2', '3:3']);
    expect(entries.filter(entry => entry.tileId === 1).every(entry => entry.count === 2)).toBe(true);
    expect(entries[0].ownerColor).toBe('red');
    expect(entries[0].facadeColor).toBe(getTubeHouseFacadeColor(1, 0));
  });

  it('draws no house for a hotel, except the four that shrink away during the hotel transition', () => {
    expect(buildTubeHouseEntries([tile(1, 5, 'red')])).toEqual([]);
    const shrinking = buildTubeHouseEntries([tile(1, 5, 'red')], new Set([1]));
    expect(shrinking).toHaveLength(4);
    expect(shrinking.every(entry => entry.count === 4)).toBe(true);
  });

  it('gives each entry a world foot and the tile heading', () => {
    const [entry] = buildTubeHouseEntries([tile(13, 1, 'red')]);
    expect(entry.position[1]).toBeGreaterThan(0);
    expect(Number.isFinite(entry.rotationY)).toBe(true);
  });

  it('knows when two lists are the same house set, ignoring identity of the model', () => {
    const one = buildTubeHouseEntries([tile(1, 2, 'red')]);
    const two = buildTubeHouseEntries([tile(1, 2, 'red')]);
    expect(sameTubeHouseEntries(one, two)).toBe(true);
    expect(sameTubeHouseEntries(one, buildTubeHouseEntries([tile(1, 3, 'red')]))).toBe(false);
    expect(sameTubeHouseEntries(one, buildTubeHouseEntries([tile(1, 2, 'blue')]))).toBe(false);
  });

  it('has room for four houses on every street', () => {
    expect(MAX_TUBE_HOUSE_INSTANCES).toBe(STREET_TILE_IDS.length * 4);
    expect(MAX_TUBE_HOUSE_INSTANCES).toBe(88);
    const full = buildTubeHouseEntries(STREET_TILE_IDS.map(id => tile(id, 4, 'red')));
    expect(full).toHaveLength(MAX_TUBE_HOUSE_INSTANCES);
  });
});

describe('tube house meshes', () => {
  it('are three instanced meshes of the shared kit material that cast and receive shadows', () => {
    const meshes = createTubeHouseMeshes();
    for (const mesh of [meshes.body, meshes.trim, meshes.roof]) {
      expect(mesh.isInstancedMesh).toBe(true);
      expect(mesh.count).toBe(0);
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
      expect(mesh.frustumCulled).toBe(false);
    }
    expect(meshes.body.material).toBe(meshes.trim.material);
    disposeTubeHouseMeshes(meshes);
  });

  it('cost at most 3 draws and a bounded number of triangles for all 88 houses', () => {
    const meshes = createTubeHouseMeshes();
    const perHouse = [meshes.body, meshes.trim, meshes.roof].reduce((sum, mesh) => sum + triangleCount(mesh.geometry), 0);
    expect(perHouse * MAX_TUBE_HOUSE_INSTANCES).toBeLessThan(88 * 180);
    disposeTubeHouseMeshes(meshes);
  });

  it('take the facade pastel on the body and the owner color on the roof', () => {
    const meshes = createTubeHouseMeshes();
    const entries = buildTubeHouseEntries([tile(1, 2, 'red')]);
    applyTubeHouseColors(meshes, entries);
    expect(meshes.body.count).toBe(2);
    expect(meshes.trim.count).toBe(2);
    expect(meshes.roof.count).toBe(2);
    const color = new THREE.Color();
    meshes.body.getColorAt(1, color);
    expect(color.getHexString()).toBe(new THREE.Color(getTubeHouseFacadeColor(1, 1)).getHexString());
    meshes.roof.getColorAt(0, color);
    expect(color.getHexString()).toBe(new THREE.Color(getPlayerDisplayColor('red')).getHexString());
    disposeTubeHouseMeshes(meshes);
  });

  it('write each house at its foot and scale it about the foot', () => {
    const meshes = createTubeHouseMeshes();
    const entries = buildTubeHouseEntries([tile(1, 2, 'red')]);
    applyTubeHouseColors(meshes, entries);
    writeTubeHouseMatrices(meshes, entries, (_entry, index) => (index === 0 ? 1 : 0.5), tileId => (tileId === 1 ? 0.05 : 0));
    const matrix = new THREE.Matrix4();
    meshes.body.getMatrixAt(0, matrix);
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    matrix.decompose(position, new THREE.Quaternion(), scale);
    expect(position.x).toBeCloseTo(entries[0].position[0], 5);
    expect(position.y).toBeCloseTo(entries[0].position[1] + 0.05, 5);
    expect(scale.x).toBeCloseTo(1);
    meshes.roof.getMatrixAt(1, matrix);
    matrix.decompose(position, new THREE.Quaternion(), scale);
    expect(scale.x).toBeCloseTo(0.5);
    expect(composeTubeHouseMatrix(entries[0], 2, 0).elements[0]).not.toBe(0);
    disposeTubeHouseMeshes(meshes);
  });
});

describe('tube house animation', () => {
  const tiles = [tile(1, 3, 'red')];

  it('plays nothing with reduced motion, a downgrade, no duration or a stale signal', () => {
    const changes = new Map([[1, change({ fromHouses: 1, toHouses: 3 })]]);
    expect(planHouseAnimations(tiles, changes, true)).toEqual([]);
    expect(planHouseAnimations(tiles, new Map([[1, change({ direction: 'DOWN', fromHouses: 3, toHouses: 1 })]]), false)).toEqual([]);
    expect(planHouseAnimations(tiles, new Map([[1, change({ fromHouses: 1, toHouses: 3, durationMs: 0 })]]), false)).toEqual([]);
    expect(planHouseAnimations(tiles, new Map([[1, change({ fromHouses: 1, toHouses: 2 })]]), false)).toEqual([]);
    expect(planHouseAnimations(tiles, new Map(), false)).toEqual([]);
  });

  it('builds the new houses one after another and leaves the old ones standing', () => {
    const [animation] = planHouseAnimations(tiles, new Map([[1, change({ fromHouses: 1, toHouses: 3 })]]), false);
    if (animation?.kind !== 'BUILD') throw new Error('expected a build');
    expect(animation.steps.map(step => step.houseIndex)).toEqual([1, 2]);
    const entries = buildTubeHouseEntries(tiles);
    expect(getHouseScale(entries[0], animation, 0)).toBe(1);
    expect(getHouseScale(entries[1], animation, 0)).toBe(0);
    expect(getHouseScale(entries[2], animation, 0)).toBe(0);
    // Mid-pop of the first new house: it overshoots 1 before it settles; the second has not started.
    const first = animation.steps[0];
    expect(getHouseScale(entries[1], animation, first.durationMs * 0.5)).toBeGreaterThan(1);
    expect(getHouseScale(entries[2], animation, first.delayMs)).toBe(0);
    expect(getHouseScale(entries[1], animation, animation.durationMs * 2)).toBe(1);
    expect(getHouseScale(entries[2], animation, animation.durationMs * 2)).toBe(1);
  });

  it('shrinks the four old houses away while the hotel comes in', () => {
    const hotelTiles = [tile(1, 5, 'red')];
    const [animation] = planHouseAnimations(hotelTiles, new Map([[1, change({ fromHouses: 4, toHouses: 5, durationMs: 800 })]]), false);
    if (animation?.kind !== 'HOTEL') throw new Error('expected a hotel transition');
    const entries = buildTubeHouseEntries(hotelTiles, new Set([1]));
    expect(getHouseScale(entries[0], animation, 0)).toBe(1);
    expect(getHouseScale(entries[0], animation, 400)).toBeLessThan(1);
    expect(getHouseScale(entries[0], animation, 800)).toBe(0);
  });

  it('is full size when the tile has no animation', () => {
    const [entry] = buildTubeHouseEntries(tiles);
    expect(getHouseScale(entry, undefined, 0)).toBe(1);
  });
});
