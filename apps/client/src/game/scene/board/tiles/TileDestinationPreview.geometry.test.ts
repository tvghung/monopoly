import * as THREE from 'three';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDestinationFrameGeometry, useDestinationFrameGeometry } from './TileDestinationPreview';

describe('destination preview frame geometry', () => {
  it('is a hollow rectangle whose outer edge is the requested footprint', () => {
    const geometry = createDestinationFrameGeometry(2, 3, 0.1);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.max.x).toBeCloseTo(1, 6);
    expect(geometry.boundingBox?.max.y).toBeCloseTo(1.5, 6);
    expect(geometry.boundingBox?.min.x).toBeCloseTo(-1, 6);
    expect(geometry.boundingBox?.min.y).toBeCloseTo(-1.5, 6);
    // A solid quad would have 2 triangles; the frame around the hole has more.
    expect(geometry.getAttribute('position').count).toBeGreaterThan(4);
    geometry.dispose();
  });
});

describe('useDestinationFrameGeometry (audit PERF-15: one geometry leaked per move)', () => {
  it('keeps one geometry while the sizes stay the same, however often the preview re-renders', () => {
    const { result, rerender } = renderHook(({ w, d }) => useDestinationFrameGeometry(w, d, 0.045), { initialProps: { w: 1.2, d: 2 } });
    const first = result.current;
    const disposed = vi.fn();
    first.addEventListener('dispose', disposed);
    for (let render = 0; render < 20; render += 1) rerender({ w: 1.2, d: 2 });
    expect(result.current).toBe(first);
    expect(disposed).not.toHaveBeenCalled();
  });

  it('disposes the geometry when the preview unmounts, which R3F does not do for a geometry passed as a prop', () => {
    const { result, unmount } = renderHook(() => useDestinationFrameGeometry(1.2, 2, 0.045));
    const disposed = vi.fn();
    result.current.addEventListener('dispose', disposed);
    unmount();
    expect(disposed).toHaveBeenCalledTimes(1);
  });

  it('builds a new geometry and disposes the old one when a size changes', () => {
    const { result, rerender } = renderHook(({ w }) => useDestinationFrameGeometry(w, 2, 0.045), { initialProps: { w: 1.2 } });
    const first = result.current;
    const disposed = vi.fn();
    first.addEventListener('dispose', disposed);
    rerender({ w: 1.4 });
    expect(result.current).not.toBe(first);
    expect(disposed).toHaveBeenCalledTimes(1);
    result.current.computeBoundingBox();
    expect(result.current.boundingBox?.max.x).toBeCloseTo(0.7, 6);
  });

  it('releases one geometry per move over many previews (30 replays used to leave 30 behind)', () => {
    const created = new Set<THREE.ShapeGeometry>();
    const disposed = vi.fn();
    for (let move = 0; move < 30; move += 1) {
      const { result, unmount } = renderHook(() => useDestinationFrameGeometry(1.2, 2, 0.045));
      created.add(result.current);
      result.current.addEventListener('dispose', disposed);
      unmount();
    }
    expect(created.size).toBe(30);
    expect(disposed).toHaveBeenCalledTimes(30);
  });
});
