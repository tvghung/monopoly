import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { TileScreenRect } from './polygonOverlap';
import { projectTileScreenRects } from './tileScreenRects';

export interface PublishedTileScreenRects {
  canvas: { left: number; top: number; width: number; height: number };
  tiles: TileScreenRect[];
}

/**
 * Dev and UAT only (mounted next to the renderer diagnostics): publishes where the 40 tiles are on screen so the
 * capture tool can check that no HUD region covers a tile (plan 03 T03.14). It recomputes when the camera or the
 * canvas size changes; the fixed camera never moves otherwise.
 */
export default function TileScreenRectsPublisher() {
  const camera = useThree(state => state.camera);
  const gl = useThree(state => state.gl);
  const width = useThree(state => state.size.width);
  const height = useThree(state => state.size.height);

  useEffect(() => {
    const publish = () => {
      const rect = gl.domElement.getBoundingClientRect();
      camera.updateMatrixWorld(true);
      const canvas = { left: rect.left + window.scrollX, top: rect.top + window.scrollY, width: rect.width, height: rect.height };
      window.__OWN_THE_BLOCK_TILE_SCREEN_RECTS__ = { canvas, tiles: projectTileScreenRects(camera, canvas) };
    };
    // The fixed camera configures itself in an effect of the same commit; wait one frame so it has run.
    const frame = window.requestAnimationFrame(publish);
    return () => window.cancelAnimationFrame(frame);
  }, [camera, gl, height, width]);

  useEffect(() => () => { delete window.__OWN_THE_BLOCK_TILE_SCREEN_RECTS__; }, []);

  return null;
}
