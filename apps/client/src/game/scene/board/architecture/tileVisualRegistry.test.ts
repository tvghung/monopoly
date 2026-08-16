import { tileState } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import { boardVisualTokens } from '../boardVisualTokens';
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
      expect('accentColor' in descriptor).toBe(false);
      expect(descriptor.surfaceKey).toBeTruthy();
      expect(descriptor.pattern).toBeTruthy();
      expect(descriptor.emblem).toBeTruthy();
      expect(descriptor.materialProfile).toMatch(/^district/);
      expect(descriptor.bumpScale).toBeGreaterThan(0);
      expect(descriptor.patternScale).toBeGreaterThan(0);
      expect(descriptor.patternTuning.patternDensity).toBeGreaterThan(0);
      expect(descriptor.patternTuning.contrast).toBeGreaterThan(0);
      expect(descriptor.patternTuning.seamWidth).toBeGreaterThan(0);
      expect(descriptor.patternTuning.spacing).toBeGreaterThan(1);
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
    expect(getPropertyVisualDescriptor('yellow').pattern).toBe('beach');
    expect(getPropertyVisualDescriptor('yellow').waterColor).toBeTruthy();
    expect(getPropertyVisualDescriptor('green').pattern).toBe('paver');
  });

  it('does not expose a legacy colored accent channel for the seven cleanup tiles', () => {
    [5, 9, 12, 14, 21, 28, 29].forEach(tileId => {
      const descriptor = getDistrictSurfaceDescriptor(tileState[tileId]);
      expect(descriptor ? 'accentColor' in descriptor : false).toBe(false);
    });
  });

  it('keeps the palette vivid while retaining light surfaces for black text', () => {
    expect(boardVisualTokens.sceneBackground).toBe('#62ddcc');
    expect(boardVisualTokens.tileDivider).toBe('#111318');
    expect(boardVisualTokens.utilityBulb).toBe('#ffd400');
    expect(boardVisualTokens.utilityWater).toBe('#19bdeb');
    expect(getPropertyVisualDescriptor('lightblue').baseColor).toBe('#5fc9e3');
    expect(getPropertyVisualDescriptor('yellow').baseColor).toBe('#f4c83f');
  });

  it('keeps the three canonical harbor-blue properties on one descriptor', () => {
    const harborDescriptor = getPropertyVisualDescriptor('lightblue');
    [6, 8, 9].forEach(tileId => {
      expect(getDistrictSurfaceDescriptor(tileState[tileId])).toMatchObject(harborDescriptor);
    });
    expect(harborDescriptor.secondaryColor).toBe('#c4ecf5');
    expect(harborDescriptor.groutColor).toBe('#5cafc4');
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
