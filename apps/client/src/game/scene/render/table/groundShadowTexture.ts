import * as THREE from 'three';

/** The decal is this much larger than the foundation footprint (plan 02 §8.5: about 1.25x). */
export const GROUND_SHADOW_SCALE = 1.25;
export const GROUND_SHADOW_TEXTURE_SIZE = 256;

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Signed distance to a rounded box centered at the origin (half extents include the radius). */
function roundedBoxDistance(x: number, y: number, half: number, radius: number): number {
  const qx = Math.abs(x) - (half - radius);
  const qy = Math.abs(y) - (half - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/**
 * RGBA data for the soft contact shadow that grounds the board on the table: black with an alpha that
 * is opaque under the board footprint and fades smoothly to nothing at the decal border. The board
 * hides the opaque middle, so only the falloff ring is ever seen.
 */
export function generateGroundShadowData(size: number = GROUND_SHADOW_TEXTURE_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const boardHalf = 0.5 / GROUND_SHADOW_SCALE;
  const radius = 0.06;
  const falloff = 0.5 - boardHalf;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = (x + 0.5) / size - 0.5;
      const py = (y + 0.5) / size - 0.5;
      const distance = Math.max(0, roundedBoxDistance(px, py, boardHalf, radius));
      const alpha = Math.pow(1 - smoothstep(0, falloff, distance), 1.7);
      data[(y * size + x) * 4 + 3] = Math.round(alpha * 255);
    }
  }
  return data;
}

export function createGroundShadowTexture(size: number = GROUND_SHADOW_TEXTURE_SIZE): THREE.DataTexture {
  const texture = new THREE.DataTexture(generateGroundShadowData(size), size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
