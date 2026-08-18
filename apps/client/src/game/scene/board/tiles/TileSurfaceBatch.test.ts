import * as THREE from 'three';
import { tileState } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import { TILE_SURFACE_INSET, getBoardTileLayout } from '../boardLayout';
import { composeTileSurfaceMatrix } from '../architecture/tileMatrix';
import {
  DISTRICT_SURFACE_KEYS,
  getDistrictSurfaceDescriptor,
} from '../architecture/tileVisualRegistry';
import {
  groupTileFooterEntries,
  groupTileSurfaceEntries,
  shouldRenderTileDivider,
  withPanel,
} from './TileSurfaceBatch';
import {
  TILE_FOOTER_PANEL_RATIO,
  TILE_UPPER_PANEL_RATIO,
  getTilePanelLayout,
} from './tilePanelLayout';

describe('tile surface material batching', () => {
  it.each([
    ['normal', true],
    ['railroad', true],
    ['company', true],
    ['chance', false],
    ['chest', false],
    ['expense', false],
  ] as const)('uses the selective divider contract for %s tiles', (tileType, eligible) => {
    expect(shouldRenderTileDivider(tileType)).toBe(eligible);
  });

  it('assigns every canonical tile once across district and white-pebble batches', () => {
    const entries = tileState.map((tile, tileId) => {
      const layout = getBoardTileLayout(tileId);
      if (!layout) throw new Error(`Missing canonical board layout for tile ${tileId}`);
      return {
        tileId,
        tileType: tile.tileType,
        side: layout.side,
        surfaceKey: getDistrictSurfaceDescriptor(tile)?.surfaceKey,
        surfaceSize: [
          Math.max(0.3, layout.size[0] - TILE_SURFACE_INSET),
          Math.max(0.3, layout.size[1] - TILE_SURFACE_INSET),
        ] as const,
      };
    });
    const groups = groupTileSurfaceEntries(entries);
    const assignedTileIds = groups.flatMap(group => group.entries.map(entry => entry.tileId));

    expect(groups.map(group => group.key)).toEqual([
      ...DISTRICT_SURFACE_KEYS,
      'specialPebble0',
      'specialPebble1',
      'specialPebble2',
      'specialPebble3',
    ]);
    expect(groups.filter(group => group.key.startsWith('specialPebble'))).toHaveLength(4);
    expect(groups).toHaveLength(12);
    expect(assignedTileIds).toHaveLength(40);
    expect(new Set(assignedTileIds).size).toBe(40);
    expect([...assignedTileIds].sort((left, right) => left - right))
      .toEqual(Array.from({ length: 40 }, (_, tileId) => tileId));
  });

  it('keeps the physical upper, divider, and footer flow aligned on Parking-adjacent runs', () => {
    const baseEntry = {
      tileId: 19,
      tileType: 'normal' as const,
      side: 'LEFT' as const,
      surfaceSize: [1.42, 2.27] as const,
      surfaceKey: 'harborCeramic' as const,
    };
    const upper = withPanel(baseEntry, 'upper');
    const footer = withPanel(baseEntry, 'footer');
    const divider = withPanel(baseEntry, 'divider');

    expect(upper.surfaceSize[1] / baseEntry.surfaceSize[1]).toBeCloseTo(TILE_UPPER_PANEL_RATIO);
    expect(footer.surfaceSize[1] / baseEntry.surfaceSize[1]).toBeCloseTo(TILE_FOOTER_PANEL_RATIO);
    expect(upper.surfacePlaneOffset).toBeLessThan(divider.surfacePlaneOffset!);
    expect(divider.surfacePlaneOffset).toBeLessThan(footer.surfacePlaneOffset!);
    expect(upper.side).toBe(footer.side);
    expect(footer.side).toBe(divider.side);
  });

  it('batches every non-corner footer into deterministic pebble variants', () => {
    const entries = tileState.map((tile, tileId) => {
      const layout = getBoardTileLayout(tileId);
      if (!layout) throw new Error(`Missing canonical board layout for tile ${tileId}`);
      return {
        tileId,
        tileType: tile.tileType,
        side: layout.side,
        surfaceKey: getDistrictSurfaceDescriptor(tile)?.surfaceKey,
        surfaceSize: [1.42, 2.27] as const,
      };
    }).filter(entry => entry.side !== 'CORNER');
    const groups = groupTileFooterEntries(entries.map(entry => withPanel(entry, 'footer')));
    const assignedTileIds = groups.flatMap(group => group.entries.map(entry => entry.tileId));

    expect(groups.map(group => group.key)).toEqual([
      'footerPebble0',
      'footerPebble1',
      'footerPebble2',
      'footerPebble3',
    ]);
    expect(assignedTileIds).toHaveLength(36);
    expect(new Set(assignedTileIds).size).toBe(36);
    expect(assignedTileIds.every(tileId => getBoardTileLayout(tileId)?.side !== 'CORNER')).toBe(true);
  });

  it('places every divider center on the shared upper/footer world-space edge', () => {
    const sideTiles = {
      BOTTOM: 1,
      LEFT: 11,
      TOP: 21,
      RIGHT: 31,
    } as const;

    Object.entries(sideTiles).forEach(([side, tileId]) => {
      const layout = getBoardTileLayout(tileId);
      if (!layout) throw new Error(`Missing canonical board layout for tile ${tileId}`);
      const baseEntry = {
        tileId,
        tileType: 'normal' as const,
        side: side as 'BOTTOM' | 'LEFT' | 'TOP' | 'RIGHT',
        surfaceSize: [1.42, 2.27] as const,
        surfaceKey: 'harborCeramic' as const,
      };
      const upper = withPanel(baseEntry, 'upper');
      const footer = withPanel(baseEntry, 'footer');
      const divider = withPanel(baseEntry, 'divider');
      const panel = getTilePanelLayout(baseEntry.surfaceSize, baseEntry.side);
      const upperMatrix = composeTileSurfaceMatrix(
        layout,
        upper.surfaceSize,
        0,
        new THREE.Matrix4(),
        upper.surfacePlaneOffset,
      );
      const footerMatrix = composeTileSurfaceMatrix(
        layout,
        footer.surfaceSize,
        0,
        new THREE.Matrix4(),
        footer.surfacePlaneOffset,
      );
      const dividerMatrix = composeTileSurfaceMatrix(
        layout,
        divider.surfaceSize,
        0,
        new THREE.Matrix4(),
        divider.surfacePlaneOffset,
      );
      const upperBoundary = new THREE.Vector3(
        0,
        -panel.flowSign * 0.5,
        0,
      ).applyMatrix4(upperMatrix);
      const footerBoundary = new THREE.Vector3(
        0,
        panel.flowSign * 0.5,
        0,
      ).applyMatrix4(footerMatrix);
      const dividerCenter = new THREE.Vector3(0, 0, 0).applyMatrix4(dividerMatrix);

      expect(upperBoundary.distanceTo(footerBoundary)).toBeLessThan(1e-9);
      expect(upperBoundary.distanceTo(dividerCenter)).toBeLessThan(1e-9);
      expect(panel.upperFooterBoundaryPlaneOffset).toBeCloseTo(panel.dividerPlaneOffset, 10);
    });
  });
});
