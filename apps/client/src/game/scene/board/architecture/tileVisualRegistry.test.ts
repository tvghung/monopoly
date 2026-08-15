import { tileState } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_PROPERTY_GROUPS,
  getPropertyVisualDescriptor,
  getTileVisualDescriptor,
} from './tileVisualRegistry';

describe('tile visual registry', () => {
  it('gives every canonical property group a deliberate visual kit', () => {
    expect(CANONICAL_PROPERTY_GROUPS).toEqual([
      'brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'blue',
    ]);
    CANONICAL_PROPERTY_GROUPS.forEach(group => {
      const descriptor = getPropertyVisualDescriptor(group);
      expect(descriptor.family).toBe('PROPERTY');
      expect(descriptor.primaryColor).not.toBe(descriptor.surfaceTint);
      expect(descriptor.emblem).toBeTruthy();
      expect(descriptor.label).not.toBe('BẤT ĐỘNG SẢN');
    });
  });

  it('covers every canonical special tile type without putting JSX in metadata', () => {
    const specialTypes = new Set(tileState.filter(tile => tile.tileType !== 'normal').map(tile => tile.tileType));
    specialTypes.forEach(tileType => {
      const descriptor = getTileVisualDescriptor(tileState.find(tile => tile.tileType === tileType)!);
      expect(descriptor.emblem).toBeTruthy();
      expect(descriptor.primaryColor).toMatch(/^#/);
    });
  });
});
