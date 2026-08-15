import { tileState } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_PROPERTY_GROUPS,
  getDistrictSurfaceDescriptor,
  getPropertyVisualDescriptor,
  getSpecialTileLabel,
} from './tileVisualRegistry';

describe('tile visual registry', () => {
  it('gives every canonical property group a deliberate visual kit', () => {
    expect(CANONICAL_PROPERTY_GROUPS).toEqual([
      'brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'blue',
    ]);
    CANONICAL_PROPERTY_GROUPS.forEach(group => {
      const descriptor = getPropertyVisualDescriptor(group);
      expect(descriptor.baseColor).not.toBe(descriptor.accentColor);
      expect(descriptor.surfaceKey).toBeTruthy();
      expect(descriptor.pattern).toBeTruthy();
      expect(descriptor.emblem).toBeTruthy();
      expect(descriptor.materialProfile).toMatch(/^district/);
      expect(descriptor.bumpScale).toBeGreaterThan(0);
      expect(descriptor.patternScale).toBeGreaterThan(0);
    });
    expect(CANONICAL_PROPERTY_GROUPS.map(group => getPropertyVisualDescriptor(group).surfaceKey))
      .toEqual([
        'oldTownStone',
        'harborCeramic',
        'coolGranite',
        'terracottaBrick',
        'metroConcrete',
        'sandstoneTerrazzo',
        'ecoSlate',
        'premiumBrownStone',
      ]);
    expect(getPropertyVisualDescriptor('pink').baseColor).not.toBe('#cc3d95');
    expect(getPropertyVisualDescriptor('blue').baseColor).not.toBe('#3559c7');
  });

  it('maps normal tiles to districts and keeps special labels as plain metadata', () => {
    expect(getDistrictSurfaceDescriptor(tileState.find(tile => tile.tileType === 'normal')!))
      .toBeDefined();
    const specialTypes = new Set(tileState.filter(tile => tile.tileType !== 'normal').map(tile => tile.tileType));
    specialTypes.forEach(tileType => {
      const tile = tileState.find(candidate => candidate.tileType === tileType)!;
      expect(getDistrictSurfaceDescriptor(tile)).toBeUndefined();
      expect(getSpecialTileLabel(tileType)).not.toBe('Ô CỜ');
    });
  });
});
