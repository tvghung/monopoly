import * as THREE from 'three';
import { renderHook } from '@testing-library/react';
import { tileState } from '@monopoly/shared';
import { describe, expect, it, vi } from 'vitest';
import { getBoardTileLayout } from '../boardLayout';
import { composeTileSurfaceMatrix } from '../architecture/tileMatrix';
import type { BoardTileRenderModel } from '../boardRenderModel';
import { TileMotionController } from '../motion/TileMotionController';
import {
  createTileImpactHighlightMeshBundle,
  createTileImpactHighlightResources,
  getTileImpactHighlightEntries,
  getTileImpactHighlightEntriesForIds,
  getTileImpactHighlightIntensity,
  useTileImpactHighlightResources,
} from './TileImpactHighlightBatch';

const allTiles = (): BoardTileRenderModel[] => tileState.map((tile, tileId) => ({
  tileId, name: '', tileType: tile.tileType, houses: 0,
}));
const tileIds = Array.from({ length: 40 }, (_, index) => index);

function pressedController() {
  let now = 0;
  const controller = new TileMotionController({ now: () => now });
  return {
    controller,
    advanceTo: (ms: number) => { now = ms; controller.advance(); },
    press: (tileId: number, kind: 'STEP' | 'LAND' = 'LAND') => {
      controller.press(tileId, kind, { delayMs: 0, depressDurationMs: 100, reboundDurationMs: 200 });
    },
  };
}

describe('highlight entries depend only on the tile ids', () => {
  it('give the same entries whether they are asked for by tiles or by ids', () => {
    expect(getTileImpactHighlightEntriesForIds(tileIds)).toEqual(getTileImpactHighlightEntries(allTiles()));
  });

  it('cover all 40 tiles: edge tiles first on the upper panel, then the corners', () => {
    const entries = getTileImpactHighlightEntriesForIds(tileIds);
    expect(entries).toHaveLength(40);
    const firstCorner = entries.findIndex(entry => entry.side === 'CORNER');
    expect(entries.slice(firstCorner).every(entry => entry.side === 'CORNER')).toBe(true);
    expect(entries.slice(0, firstCorner).every(entry => entry.side !== 'CORNER')).toBe(true);
  });
});

describe('createTileImpactHighlightResources', () => {
  it('owns one mesh, one material and one geometry that belong together', () => {
    const resources = createTileImpactHighlightResources(getTileImpactHighlightEntriesForIds(tileIds), null);
    expect(resources.mesh.material).toBe(resources.material);
    expect(resources.mesh.geometry).toBe(resources.geometry);
    expect(resources.mesh.count).toBe(40);
    expect(resources.material.name).toBe('TileImpactHighlightMaterial');
    expect(resources.mesh.name).toBe('TileImpactHighlightBatch');
    resources.dispose();
  });

  it('releases the mesh buffers, the material and the geometry on dispose, and may be disposed again', () => {
    const resources = createTileImpactHighlightResources(getTileImpactHighlightEntriesForIds(tileIds), null);
    const meshDispose = vi.fn();
    resources.mesh.addEventListener('dispose', meshDispose);
    const materialDispose = vi.fn();
    resources.material.addEventListener('dispose', materialDispose);
    const geometryDispose = vi.fn();
    resources.geometry.addEventListener('dispose', geometryDispose);
    resources.dispose();
    expect(meshDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(() => resources.dispose()).not.toThrow();
  });

  it('writes every tile on the first sync and then only the tiles whose state changed', () => {
    const { controller, advanceTo, press } = pressedController();
    const resources = createTileImpactHighlightResources(getTileImpactHighlightEntriesForIds(tileIds), controller);
    expect(resources.sync(controller)).toBe(true);
    // Nothing moved: nothing to write.
    expect(resources.sync(controller)).toBe(false);
    expect(resources.sync(controller)).toBe(false);

    const setMatrix = vi.spyOn(resources.mesh, 'setMatrixAt');
    press(1);
    advanceTo(15);
    expect(resources.sync(controller)).toBe(true);
    expect(setMatrix).toHaveBeenCalledTimes(1);

    // The press has finished and the tile is neutral again: one more write, then quiet.
    advanceTo(1_000);
    expect(resources.sync(controller)).toBe(true);
    setMatrix.mockClear();
    expect(resources.sync(controller)).toBe(false);
    expect(setMatrix).not.toHaveBeenCalled();
    resources.dispose();
  });

  it('writes what the old per-render rebuild wrote: same matrix and same intensity at the current press state', () => {
    const { controller, advanceTo, press } = pressedController();
    press(1);
    press(14, 'STEP');
    advanceTo(15);
    const entries = getTileImpactHighlightEntriesForIds(tileIds);
    const resources = createTileImpactHighlightResources(entries, null);
    resources.sync(controller);
    const reference = createTileImpactHighlightMeshBundle(new THREE.PlaneGeometry(1, 1), entries, controller);
    const actual = new THREE.Matrix4();
    const expected = new THREE.Matrix4();
    const actualColor = new THREE.Color();
    const expectedColor = new THREE.Color();
    entries.forEach((_, index) => {
      resources.mesh.getMatrixAt(index, actual);
      reference.mesh.getMatrixAt(index, expected);
      resources.mesh.getColorAt(index, actualColor);
      reference.mesh.getColorAt(index, expectedColor);
      actual.elements.forEach((element, elementIndex) => expect(element).toBeCloseTo(expected.elements[elementIndex], 6));
      expect(actualColor.r).toBeCloseTo(expectedColor.r, 6);
    });
    const pressedIndex = entries.findIndex(entry => entry.tileId === 1);
    resources.mesh.getColorAt(pressedIndex, actualColor);
    expect(actualColor.r).toBeCloseTo(getTileImpactHighlightIntensity(controller.getTilePressIntensity(1), 'LAND'), 6);
    resources.mesh.getMatrixAt(pressedIndex, actual);
    const layout = getBoardTileLayout(1)!;
    composeTileSurfaceMatrix(layout, entries[pressedIndex].surfaceSize, controller.getTileOffsetY(1), expected, (entries[pressedIndex].surfacePlaneOffset ?? 0) + 0.002);
    expect(actual.elements[13]).toBeCloseTo(expected.elements[13], 6);
    resources.dispose();
    reference.material.dispose();
  });

  it('never grows its per-tile state, however long it runs (audit PERF-14: +40 keys per board render)', () => {
    const { controller, advanceTo, press } = pressedController();
    const resources = createTileImpactHighlightResources(getTileImpactHighlightEntriesForIds(tileIds), controller);
    expect(resources.trackedTiles).toBe(40);
    for (let frame = 0; frame < 2_000; frame += 1) {
      if (frame % 50 === 0) press(frame % 40);
      advanceTo(frame * 16);
      resources.sync(controller);
    }
    expect(resources.trackedTiles).toBe(40);
    expect(resources.mesh.count).toBe(40);
    resources.dispose();
  });
});

describe('useTileImpactHighlightResources (audit PERF-01: a new tiles array rebuilt the material and re-linked its program)', () => {
  it('keeps one mesh, material and geometry across re-renders that bring a new tiles array', () => {
    const { result, rerender } = renderHook(({ tiles }) => useTileImpactHighlightResources(tiles), {
      initialProps: { tiles: allTiles() },
    });
    const first = result.current;
    for (let render = 0; render < 10; render += 1) rerender({ tiles: allTiles() });
    expect(result.current).toBe(first);
    expect(result.current.material).toBe(first.material);
    expect(result.current.mesh).toBe(first.mesh);
  });

  it('keeps the resources when tile data other than the id set changes', () => {
    const { result, rerender } = renderHook(({ tiles }) => useTileImpactHighlightResources(tiles), {
      initialProps: { tiles: allTiles() },
    });
    const first = result.current;
    rerender({ tiles: allTiles().map(tile => ({ ...tile, houses: 2, ownerId: 'a', ownerColor: 'red', name: 'x' })) });
    expect(result.current).toBe(first);
  });

  it('does not dispose the resources while they stay in use', () => {
    const { result, rerender } = renderHook(({ tiles }) => useTileImpactHighlightResources(tiles), {
      initialProps: { tiles: allTiles() },
    });
    const materialDispose = vi.fn();
    result.current.material.addEventListener('dispose', materialDispose);
    for (let render = 0; render < 5; render += 1) rerender({ tiles: allTiles() });
    expect(materialDispose).not.toHaveBeenCalled();
  });

  it('disposes everything it owns when the owner unmounts', () => {
    const { result, unmount } = renderHook(({ tiles }) => useTileImpactHighlightResources(tiles), {
      initialProps: { tiles: allTiles() },
    });
    const { mesh, material, geometry } = result.current;
    const disposed = { mesh: vi.fn(), material: vi.fn(), geometry: vi.fn() };
    mesh.addEventListener('dispose', disposed.mesh);
    material.addEventListener('dispose', disposed.material);
    geometry.addEventListener('dispose', disposed.geometry);
    unmount();
    expect(disposed.mesh).toHaveBeenCalledTimes(1);
    expect(disposed.material).toHaveBeenCalledTimes(1);
    expect(disposed.geometry).toHaveBeenCalledTimes(1);
  });

  it('replaces and disposes the previous resources when the set of tiles really changes', () => {
    const { result, rerender } = renderHook(({ tiles }) => useTileImpactHighlightResources(tiles), {
      initialProps: { tiles: allTiles() },
    });
    const first = result.current;
    const materialDispose = vi.fn();
    first.material.addEventListener('dispose', materialDispose);
    rerender({ tiles: allTiles().slice(0, 39) });
    expect(result.current).not.toBe(first);
    expect(result.current.mesh.count).toBe(39);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it('survives repeated mount and unmount cycles without sharing anything between them', () => {
    const seen = new Set<THREE.Material>();
    for (let cycle = 0; cycle < 5; cycle += 1) {
      const { result, unmount } = renderHook(({ tiles }) => useTileImpactHighlightResources(tiles), {
        initialProps: { tiles: allTiles() },
      });
      expect(seen.has(result.current.material)).toBe(false);
      seen.add(result.current.material);
      unmount();
    }
    expect(seen.size).toBe(5);
  });
});
