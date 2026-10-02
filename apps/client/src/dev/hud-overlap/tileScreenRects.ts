import * as THREE from 'three';
import { boardLayout, TILE_SURFACE_Y } from '../../game/scene/board/boardLayout';
import type { TileScreenRect } from './polygonOverlap';

const corner = new THREE.Vector3();

/**
 * Projects the top surface of each of the 40 tiles to page coordinates (CSS pixels). `canvasRect` is the canvas
 * bounding rectangle in the page, so the result compares directly with the bounding boxes of DOM elements.
 */
export function projectTileScreenRects(
  camera: THREE.Camera,
  canvasRect: { left: number; top: number; width: number; height: number },
): TileScreenRect[] {
  return boardLayout.map(layout => {
    const [width, depth] = layout.size;
    const rotationY = layout.rotation[1];
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);
    const corners = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([signX, signZ]) => {
      const localX = signX * width / 2;
      const localZ = signZ * depth / 2;
      corner.set(
        layout.position[0] + localX * cos + localZ * sin,
        TILE_SURFACE_Y,
        layout.position[2] - localX * sin + localZ * cos,
      );
      corner.project(camera);
      return {
        x: canvasRect.left + (corner.x * 0.5 + 0.5) * canvasRect.width,
        y: canvasRect.top + (-corner.y * 0.5 + 0.5) * canvasRect.height,
      };
    });
    return { tileId: layout.tileId, corners: corners as unknown as TileScreenRect['corners'] };
  });
}
