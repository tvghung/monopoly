import * as THREE from 'three';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createConstructionPuffMaterial, useConstructionPuffMaterial } from './ConstructionPuff';

describe('construction puff material', () => {
  it('looks exactly as the JSX material did', () => {
    const material = createConstructionPuffMaterial();
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(material.vertexColors).toBe(true);
    expect(material.color.getHexString()).toBe('ffffff');
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.86);
    expect(material.roughness).toBe(0.94);
    material.dispose();
  });
});

describe('useConstructionPuffMaterial (audit PERF-05: every build linked the puff program again)', () => {
  it('keeps one material across re-renders and builds, and releases it once with its owner', () => {
    const { result, rerender, unmount } = renderHook(() => useConstructionPuffMaterial());
    const first = result.current;
    const disposed = vi.fn();
    first.addEventListener('dispose', disposed);
    for (let render = 0; render < 20; render += 1) rerender();
    expect(result.current).toBe(first);
    expect(disposed).not.toHaveBeenCalled();
    unmount();
    expect(disposed).toHaveBeenCalledTimes(1);
  });

  it('gives each owner its own material', () => {
    const first = renderHook(() => useConstructionPuffMaterial());
    const second = renderHook(() => useConstructionPuffMaterial());
    expect(first.result.current).not.toBe(second.result.current);
    first.unmount();
    second.unmount();
  });
});
