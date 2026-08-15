import { describe, expect, it } from 'vitest';
import { DISTRICT_SURFACE_KEYS } from '../architecture/tileVisualRegistry';
import { groupTileSurfaceEntries } from './TileSurfaceBatch';

describe('tile surface material batching', () => {
  it('creates one batch per district material key and keeps specials separate', () => {
    const entries = [
      ...DISTRICT_SURFACE_KEYS.map((surfaceKey, tileId) => ({
        tileId,
        surfaceKey,
        surfaceSize: [1.2, 2.2] as const,
      })),
      { tileId: 30, surfaceSize: [2.3, 2.3] as const },
      { tileId: 36, surfaceSize: [1.2, 2.2] as const },
    ];
    const groups = groupTileSurfaceEntries(entries);

    expect(groups.map(group => group.key)).toEqual([...DISTRICT_SURFACE_KEYS, 'special']);
    expect(groups.filter(group => group.key !== 'special')).toHaveLength(8);
    expect(groups.find(group => group.key === 'special')?.entries.map(entry => entry.tileId))
      .toEqual([30, 36]);
  });
});
