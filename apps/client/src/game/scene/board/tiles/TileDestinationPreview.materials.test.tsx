import type { ReactNode } from 'react';
import * as THREE from 'three';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DESTINATION_PREVIEW_STATIC_EDGE_OPACITY,
  DESTINATION_PREVIEW_STATIC_SURFACE_OPACITY,
  DestinationPreviewMaterialsContext,
  createDestinationPreviewMaterials,
  useDestinationPreviewMaterials,
  useDestinationPreviewMaterialsOwner,
  type DestinationPreviewMaterials,
} from './TileDestinationPreview';

const disposalOf = (materials: DestinationPreviewMaterials) => {
  const surface = vi.fn();
  const edge = vi.fn();
  materials.surface.addEventListener('dispose', surface);
  materials.edge.addEventListener('dispose', edge);
  return { surface, edge };
};

const withProvider = (materials: DestinationPreviewMaterials | null) => function Provider({ children }: { children: ReactNode }) {
  return <DestinationPreviewMaterialsContext.Provider value={materials}>{children}</DestinationPreviewMaterialsContext.Provider>;
};

describe('destination preview materials', () => {
  it('look exactly as the JSX materials did: transparent, no depth write, normal blending, not tone mapped', () => {
    const { surface, edge } = createDestinationPreviewMaterials();
    [surface, edge].forEach(material => {
      expect(material).toBeInstanceOf(THREE.MeshBasicMaterial);
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(false);
      expect(material.blending).toBe(THREE.NormalBlending);
      expect(material.toneMapped).toBe(false);
    });
    expect(surface.opacity).toBe(DESTINATION_PREVIEW_STATIC_SURFACE_OPACITY);
    expect(edge.opacity).toBe(DESTINATION_PREVIEW_STATIC_EDGE_OPACITY);
    expect(surface).not.toBe(edge);
  });
});

describe('useDestinationPreviewMaterialsOwner (the board)', () => {
  it('keeps one pair for the board\'s lifetime and releases it once on unmount', () => {
    const { result, rerender, unmount } = renderHook(() => useDestinationPreviewMaterialsOwner());
    const first = result.current;
    const disposed = disposalOf(first);
    for (let render = 0; render < 10; render += 1) rerender();
    expect(result.current).toBe(first);
    expect(disposed.surface).not.toHaveBeenCalled();
    unmount();
    expect(disposed.surface).toHaveBeenCalledTimes(1);
    expect(disposed.edge).toHaveBeenCalledTimes(1);
  });
});

describe('useDestinationPreviewMaterials (the preview)', () => {
  it('borrows the board\'s pair and never disposes it, however many previews come and go', () => {
    const shared = createDestinationPreviewMaterials();
    const disposed = disposalOf(shared);
    for (let move = 0; move < 30; move += 1) {
      const { result, unmount } = renderHook(() => useDestinationPreviewMaterials(), { wrapper: withProvider(shared) });
      expect(result.current).toBe(shared);
      unmount();
    }
    expect(disposed.surface).not.toHaveBeenCalled();
    expect(disposed.edge).not.toHaveBeenCalled();
  });

  it('creates and releases a pair of its own when there is no board to borrow from', () => {
    const { result, rerender, unmount } = renderHook(() => useDestinationPreviewMaterials(), { wrapper: withProvider(null) });
    const own = result.current;
    const disposed = disposalOf(own);
    rerender();
    rerender();
    expect(result.current).toBe(own);
    expect(disposed.surface).not.toHaveBeenCalled();
    unmount();
    expect(disposed.surface).toHaveBeenCalledTimes(1);
    expect(disposed.edge).toHaveBeenCalledTimes(1);
  });

  it('switches from its own pair to the board\'s without disposing the board\'s', () => {
    const shared = createDestinationPreviewMaterials();
    const sharedDisposed = disposalOf(shared);
    let provided: DestinationPreviewMaterials | null = null;
    const { result, rerender } = renderHook(() => useDestinationPreviewMaterials(), {
      wrapper: ({ children }) => withProvider(provided)({ children }),
    });
    const own = result.current;
    const ownDisposed = disposalOf(own);
    provided = shared;
    rerender();
    expect(result.current).toBe(shared);
    expect(ownDisposed.surface).toHaveBeenCalledTimes(1);
    expect(sharedDisposed.surface).not.toHaveBeenCalled();
  });
});
