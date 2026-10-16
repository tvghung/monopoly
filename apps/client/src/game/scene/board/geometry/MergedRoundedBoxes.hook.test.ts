import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  createMergedBoxGeometry,
  getMergedBoxSpecsKey,
  useMergedBoxGeometry,
  type MergedBoxSpec,
} from './MergedRoundedBoxes';

const box = (overrides: Partial<MergedBoxSpec> = {}): MergedBoxSpec => ({
  width: 1, height: 0.5, depth: 0.25, radius: 0.05, color: '#ff0000', position: [0, 0, 0], ...overrides,
});
const specs = () => [box(), box({ position: [2, 0, 0], rotation: [0, 0.3, 0] }), box({ color: '#00ff00', segments: 3 })];

describe('getMergedBoxSpecsKey', () => {
  it('is equal for equal content in any array, and in any property order', () => {
    expect(getMergedBoxSpecsKey(specs())).toBe(getMergedBoxSpecsKey(specs()));
    const reordered: MergedBoxSpec = {
      position: [0, 0, 0], color: '#ff0000', radius: 0.05, depth: 0.25, height: 0.5, width: 1,
    };
    expect(getMergedBoxSpecsKey([reordered])).toBe(getMergedBoxSpecsKey([box()]));
  });

  it('treats the documented defaults (segments 2, no rotation) as the explicit values', () => {
    expect(getMergedBoxSpecsKey([box()])).toBe(getMergedBoxSpecsKey([box({ segments: 2, rotation: [0, 0, 0] })]));
  });

  it('differs for any change that changes the baked geometry', () => {
    const base = getMergedBoxSpecsKey([box()]);
    const changes: Partial<MergedBoxSpec>[] = [
      { width: 1.01 }, { height: 0.51 }, { depth: 0.26 }, { radius: 0.06 }, { segments: 3 }, { color: '#ff0001' },
      { position: [0, 0, 0.01] }, { rotation: [0, 0.01, 0] },
    ];
    changes.forEach(change => expect(getMergedBoxSpecsKey([box(change)])).not.toBe(base));
    expect(getMergedBoxSpecsKey([box(), box()])).not.toBe(base);
  });

  it('keeps the order of the boxes significant', () => {
    const a = box({ position: [1, 0, 0] });
    const b = box({ position: [2, 0, 0] });
    expect(getMergedBoxSpecsKey([a, b])).not.toBe(getMergedBoxSpecsKey([b, a]));
  });
});

describe('useMergedBoxGeometry (audit PERF-02: ~27 rounded boxes were rebuilt on every board render)', () => {
  it('builds exactly the geometry createMergedBoxGeometry builds', () => {
    const { result } = renderHook(() => useMergedBoxGeometry(specs()));
    const reference = createMergedBoxGeometry(specs());
    expect(result.current.getAttribute('position').count).toBe(reference.getAttribute('position').count);
    expect(Array.from(result.current.getAttribute('position').array)).toEqual(Array.from(reference.getAttribute('position').array));
    expect(Array.from(result.current.getAttribute('color').array)).toEqual(Array.from(reference.getAttribute('color').array));
    expect(result.current.index?.count).toBe(reference.index?.count);
  });

  it('keeps one geometry across re-renders that bring a new array of equal specs', () => {
    const { result, rerender } = renderHook(({ list }) => useMergedBoxGeometry(list), { initialProps: { list: specs() } });
    const first = result.current;
    for (let render = 0; render < 10; render += 1) rerender({ list: specs() });
    expect(result.current).toBe(first);
  });

  it('keeps the geometry undisposed while its content stays the same', () => {
    const { result, rerender } = renderHook(({ list }) => useMergedBoxGeometry(list), { initialProps: { list: specs() } });
    const disposed = vi.fn();
    result.current.addEventListener('dispose', disposed);
    for (let render = 0; render < 10; render += 1) rerender({ list: specs() });
    expect(disposed).not.toHaveBeenCalled();
  });

  it('builds a new geometry and disposes the old one when the content changes', () => {
    const { result, rerender } = renderHook(({ list }) => useMergedBoxGeometry(list), { initialProps: { list: specs() } });
    const first = result.current;
    const disposed = vi.fn();
    first.addEventListener('dispose', disposed);
    rerender({ list: [box({ width: 3 })] });
    expect(result.current).not.toBe(first);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(result.current.getAttribute('position').count).toBe(createMergedBoxGeometry([box({ width: 3 })]).getAttribute('position').count);
  });

  it('disposes the geometry when the owner unmounts', () => {
    const { result, unmount } = renderHook(() => useMergedBoxGeometry(specs()));
    const disposed = vi.fn();
    result.current.addEventListener('dispose', disposed);
    unmount();
    expect(disposed).toHaveBeenCalledTimes(1);
  });

  it('gives two owners with equal specs separate geometries, so one unmounting never disposes the other\'s', () => {
    const first = renderHook(() => useMergedBoxGeometry(specs()));
    const second = renderHook(() => useMergedBoxGeometry(specs()));
    expect(first.result.current).not.toBe(second.result.current);
    const secondDisposed = vi.fn();
    second.result.current.addEventListener('dispose', secondDisposed);
    first.unmount();
    expect(secondDisposed).not.toHaveBeenCalled();
    second.unmount();
    expect(secondDisposed).toHaveBeenCalledTimes(1);
  });

  it('releases every geometry it built over repeated mount and unmount cycles', () => {
    const geometries = new Set<unknown>();
    const disposed = vi.fn();
    for (let cycle = 0; cycle < 6; cycle += 1) {
      const { result, unmount } = renderHook(() => useMergedBoxGeometry(specs()));
      geometries.add(result.current);
      result.current.addEventListener('dispose', disposed);
      unmount();
    }
    expect(geometries.size).toBe(6);
    expect(disposed).toHaveBeenCalledTimes(6);
  });
});
