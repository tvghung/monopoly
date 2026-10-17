import { afterEach, describe, expect, it } from 'vitest';
import { boardLayout } from '../boardLayout';
import {
  TILE_PANEL_LAYOUT_CACHE_LIMIT,
  clearTilePanelLayoutCache,
  getOrientedTilePanelLayoutForTileSize,
  getTilePanelLayout,
  getTilePanelLayoutCacheSize,
} from './tilePanelLayout';

afterEach(clearTilePanelLayoutCache);

describe('tile panel layout cache (audit PERF-02)', () => {
  it('returns the identical layout object for equal inputs, so memos keyed on it stay valid', () => {
    const first = getTilePanelLayout([1.35, 2.35], 'BOTTOM');
    expect(getTilePanelLayout([1.35, 2.35], 'BOTTOM')).toBe(first);
    // A different array holding the same numbers is the same input.
    expect(getTilePanelLayout([1.35, 2.35] as const, 'BOTTOM')).toBe(first);
    const oriented = getOrientedTilePanelLayoutForTileSize([1.4, 2.4], 'LEFT');
    expect(getOrientedTilePanelLayoutForTileSize([1.4, 2.4], 'LEFT')).toBe(oriented);
  });

  it('keeps layouts of different size or side apart', () => {
    const base = getTilePanelLayout([1.35, 2.35], 'BOTTOM');
    expect(getTilePanelLayout([1.35, 2.35], 'TOP')).not.toBe(base);
    expect(getTilePanelLayout([1.36, 2.35], 'BOTTOM')).not.toBe(base);
    expect(getTilePanelLayout([1.35, 2.35], 'TOP').flowSign).toBe(-1);
    expect(base.flowSign).toBe(1);
  });

  it('treats sizes clamped to the same minimum as the same input', () => {
    expect(getTilePanelLayout([0.1, 0.2], 'RIGHT')).toBe(getTilePanelLayout([0.29, 0.3], 'RIGHT'));
  });

  it('is immutable because it is shared', () => {
    const layout = getTilePanelLayout([1.35, 2.35], 'BOTTOM');
    expect(Object.isFrozen(layout)).toBe(true);
    expect(Object.isFrozen(layout.surfaceSize)).toBe(true);
    expect(Object.isFrozen(layout.upperSize)).toBe(true);
    expect(Object.isFrozen(layout.footerSize)).toBe(true);
    expect(Object.isFrozen(layout.dividerSize)).toBe(true);
    expect(() => { (layout as { side: string }).side = 'TOP'; }).toThrow(TypeError);
  });

  it('computes exactly the numbers it computed before it was cached', () => {
    const layout = getTilePanelLayout([1.35, 2.35], 'BOTTOM');
    expect(layout.surfaceSize).toEqual([1.35, 2.35]);
    expect(layout.upperSize[1]).toBeCloseTo(2.35 * 0.7, 12);
    expect(layout.footerSize[1]).toBeCloseTo(2.35 * 0.3, 12);
    expect(layout.upperPlaneOffset).toBeCloseTo(((2.35 - 2.35 * 0.7) / 2), 12);
    expect(layout.contentRotationY).toBe(0);
    expect(getTilePanelLayout([1.35, 2.35], 'LEFT').contentRotationY).toBe(Math.PI);
  });

  it('serves every one of the 40 board tiles from a handful of entries', () => {
    boardLayout.forEach(layout => getOrientedTilePanelLayoutForTileSize(layout.size, layout.side));
    const afterFirstPass = getTilePanelLayoutCacheSize();
    expect(afterFirstPass).toBeLessThan(15);
    boardLayout.forEach(layout => getOrientedTilePanelLayoutForTileSize(layout.size, layout.side));
    expect(getTilePanelLayoutCacheSize()).toBe(afterFirstPass);
  });

  it('is bounded: arbitrary inputs cannot grow it past the limit', () => {
    for (let index = 0; index < TILE_PANEL_LAYOUT_CACHE_LIMIT * 3; index += 1) {
      getTilePanelLayout([1 + index * 0.01, 2], 'BOTTOM');
    }
    expect(getTilePanelLayoutCacheSize()).toBe(TILE_PANEL_LAYOUT_CACHE_LIMIT);
  });

  it('evicts the least recently used entry first', () => {
    const hot = getTilePanelLayout([5, 5], 'BOTTOM');
    for (let index = 0; index < TILE_PANEL_LAYOUT_CACHE_LIMIT - 1; index += 1) {
      getTilePanelLayout([1 + index * 0.01, 2], 'BOTTOM');
      // Using the hot entry keeps it the newest, so the churn below never evicts it.
      getTilePanelLayout([5, 5], 'BOTTOM');
    }
    for (let index = 0; index < 10; index += 1) {
      getTilePanelLayout([9 + index * 0.01, 2], 'BOTTOM');
      getTilePanelLayout([5, 5], 'BOTTOM');
    }
    expect(getTilePanelLayout([5, 5], 'BOTTOM')).toBe(hot);
  });
});
