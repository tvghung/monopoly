import { tileState } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import { TILE_SURFACE_INSET, getBoardTileLayout } from '../boardLayout';
import {
  DISTRICT_SURFACE_KEYS,
  getDistrictSurfaceDescriptor,
} from '../architecture/tileVisualRegistry';
import { groupTileSurfaceEntries } from './TileSurfaceBatch';

describe('tile surface material batching', () => {
  it('assigns every canonical tile once across eight district batches and one special batch', () => {
    const entries = tileState.map((tile, tileId) => {
      const layout = getBoardTileLayout(tileId);
      if (!layout) throw new Error(`Missing canonical board layout for tile ${tileId}`);
      return {
        tileId,
        surfaceKey: getDistrictSurfaceDescriptor(tile)?.surfaceKey,
        surfaceSize: [
          Math.max(0.3, layout.size[0] - TILE_SURFACE_INSET),
          Math.max(0.3, layout.size[1] - TILE_SURFACE_INSET),
        ] as const,
      };
    });
    const groups = groupTileSurfaceEntries(entries);
    const assignedTileIds = groups.flatMap(group => group.entries.map(entry => entry.tileId));

    expect(groups.map(group => group.key)).toEqual([...DISTRICT_SURFACE_KEYS, 'special']);
    expect(groups.filter(group => group.key !== 'special')).toHaveLength(8);
    expect(groups).toHaveLength(9);
    expect(assignedTileIds).toHaveLength(40);
    expect(new Set(assignedTileIds).size).toBe(40);
    expect([...assignedTileIds].sort((left, right) => left - right))
      .toEqual(Array.from({ length: 40 }, (_, tileId) => tileId));
  });
});
