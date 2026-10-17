import * as THREE from 'three';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDiceTrailMaterials, getDiceTrailCount, useDiceTrailMaterials } from './DiceLayer';

describe('dice trail materials', () => {
  it('has no trail on Low, one on Balanced and two on High', () => {
    expect(getDiceTrailCount('low')).toBe(0);
    expect(getDiceTrailCount('balanced')).toBe(1);
    expect(getDiceTrailCount('high')).toBe(2);
  });

  it('keeps the trail look: transparent, depth-write off, untone-mapped, starting invisible', () => {
    const [first, second] = createDiceTrailMaterials(2);
    expect(first.color.getHexString()).toBe(new THREE.Color('#d6e7ff').getHexString());
    expect(second.color.getHexString()).toBe(new THREE.Color('#edf4ff').getHexString());
    [first, second].forEach(material => {
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(false);
      expect(material.toneMapped).toBe(false);
      expect(material.opacity).toBe(0);
      material.dispose();
    });
    expect(createDiceTrailMaterials(0)).toEqual([]);
  });
});

describe('useDiceTrailMaterials (audit PERF-05: trail materials were disposed after every roll and their program re-linked)', () => {
  it('keeps the same materials for as long as the die lives, however many rolls and re-renders', () => {
    const { result, rerender } = renderHook(({ count }) => useDiceTrailMaterials(count), { initialProps: { count: 1 } });
    const first = result.current;
    const disposed = vi.fn();
    first[0].addEventListener('dispose', disposed);
    for (let render = 0; render < 20; render += 1) rerender({ count: 1 });
    expect(result.current).toBe(first);
    expect(disposed).not.toHaveBeenCalled();
  });

  it('disposes the materials when the die unmounts', () => {
    const { result, unmount } = renderHook(() => useDiceTrailMaterials(2));
    const disposed = result.current.map(material => {
      const listener = vi.fn();
      material.addEventListener('dispose', listener);
      return listener;
    });
    unmount();
    disposed.forEach(listener => expect(listener).toHaveBeenCalledTimes(1));
  });

  it('replaces and disposes the materials when the quality tier changes the trail count', () => {
    const { result, rerender } = renderHook(({ count }) => useDiceTrailMaterials(count), { initialProps: { count: 1 } });
    const balanced = result.current;
    const disposed = vi.fn();
    balanced[0].addEventListener('dispose', disposed);
    rerender({ count: 2 });
    expect(result.current).toHaveLength(2);
    expect(result.current).not.toBe(balanced);
    expect(disposed).toHaveBeenCalledTimes(1);
    rerender({ count: 0 });
    expect(result.current).toEqual([]);
  });
});
