import { describe, expect, it, vi, afterEach } from 'vitest';

const frameLoop = vi.hoisted(() => ({
  callbacks: [] as { callback: () => void; priority: number }[],
  invalidate: vi.fn(),
}));
vi.mock('@react-three/fiber', async importOriginal => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  useFrame: (callback: () => void, priority = 0) => {
    frameLoop.callbacks.push({ callback, priority });
  },
  useThree: (selector: (state: { invalidate: () => void }) => unknown) => selector({ invalidate: frameLoop.invalidate }),
}));
import { getUnprocessedTileImpacts } from './TileMotionProvider';

import { createElement, useEffect } from 'react';
import { cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import { tileState } from '@monopoly/shared';
import { composeTileSurfaceMatrix } from '../architecture/tileMatrix';
import { BOARD_FOUNDATION_HEIGHT, TILE_SOCKET_LIP_HEIGHT, PROPERTY_NAME_Y } from '../architecture/boardArtSpec';
import { getBoardTileLayout, TILE_SURFACE_LOCAL_POSITION } from '../boardLayout';
import { buildBodyEntries, createTileBodyGeometry, createTileBodyMesh, syncTileBodyOffsets, TILE_BODY_CENTER_Y } from '../tiles/tileBodyInstances';
import type { TileMotionController } from './TileMotionController';
import type { TileImpactSignal } from './tileMotionTypes';

afterEach(() => { cleanup(); frameLoop.callbacks.length = 0; vi.restoreAllMocks(); });

const impact = (sequence: number, tileId: number, playerId = 'player-a'): TileImpactSignal => ({
  sequence,
  tileId,
  playerId,
  kind: 'STEP',
  delayMs: 0,
  depressDurationMs: 52,
  reboundDurationMs: 126,
});

describe('tile impact cursor', () => {
  it('processes each impact once and never replays an earlier sequence', () => {
    const impacts = [impact(1, 1), impact(2, 2)];

    expect(getUnprocessedTileImpacts(impacts, 0).map(item => item.sequence)).toEqual([1, 2]);
    expect(getUnprocessedTileImpacts(impacts, 1).map(item => item.sequence)).toEqual([2]);
    expect(getUnprocessedTileImpacts(impacts, 2)).toEqual([]);
  });

  it('keeps another player impact independent from a stationary player cursor', () => {
    const impacts = [impact(1, 4, 'player-b')];

    expect(getUnprocessedTileImpacts(impacts, 0)).toEqual(impacts);
    expect(getUnprocessedTileImpacts(impacts, 1)).toEqual([]);
  });
});

it('advances before child batch readers on every start/peak/rebound/rest frame, across all 40 tiles', async () => {
  vi.resetModules();
  const { useFrame } = await import('@react-three/fiber');
  const { default: TileMotionProvider, useTileMotionController } = await import('./TileMotionProvider');
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  let controller: TileMotionController | null = null;
  const roots = tileState.map(() => new THREE.Group());
  const tiles = tileState.map((tile, tileId) => ({ tileId, name: tile.streetName, tileType: tile.tileType, houses: 0 }));
  const entries = buildBodyEntries(tiles);
  const geometry = createTileBodyGeometry();
  const body = createTileBodyMesh(entries, geometry);
  const previous = new Map<number, number>();
  const surfaces = new Map<number, THREE.Matrix4>();
  function Batches() {
    const motion = useTileMotionController();
    useEffect(() => {
      controller = motion;
      const release = roots.map((root, tileId) => motion!.register(tileId, root));
      return () => release.forEach(unregister => unregister());
    }, [motion]);
    useFrame(() => {
      syncTileBodyOffsets(body, entries, tileId => motion!.getTileOffsetY(tileId), previous);
      entries.forEach(entry => {
        const layout = getBoardTileLayout(entry.tileId)!;
        surfaces.set(entry.tileId, composeTileSurfaceMatrix(layout, layout.size, motion!.getTileOffsetY(entry.tileId)));
      });
    });
    return null;
  }
  render(createElement(TileMotionProvider, { impacts: [], resetEpoch: 0, children: createElement(Batches) }));
  expect(frameLoop.callbacks.some(frame => frame.priority < 0)).toBe(true);
  const tick = () => frameLoop.callbacks.slice().sort((a, b) => a.priority - b.priority).forEach(frame => frame.callback());
  for (let tileId = 0; tileId < 40; tileId += 1) {
    now = 0;
    controller!.press(tileId, 'LAND', { delayMs: 0, depressDurationMs: 100, reboundDurationMs: 200 });
    for (const time of [0, 15, 100, 180, 300]) {
      now = time;
      tick();
      const offset = roots[tileId].position.y;
      const matrix = new THREE.Matrix4();
      body.getMatrixAt(tileId, matrix);
      expect(matrix.elements[13] - TILE_BODY_CENTER_Y).toBeCloseTo(offset, 6);
      expect(surfaces.get(tileId)!.elements[13] - TILE_SURFACE_LOCAL_POSITION[1]).toBeCloseTo(offset, 6);
      expect(PROPERTY_NAME_Y + offset).toBeGreaterThan(surfaces.get(tileId)!.elements[13]);
      expect(surfaces.get(tileId)!.elements[13]).toBeGreaterThan(BOARD_FOUNDATION_HEIGHT + TILE_SOCKET_LIP_HEIGHT);
    }
    expect(roots[tileId].position.y).toBe(0);
  }
  geometry.dispose();
  (body.material as THREE.Material).dispose();
});
