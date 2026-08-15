export const TARGET_TRIANGLES = 80_000;
export const HARD_TRIANGLE_LIMIT = 100_000;
export const TARGET_DRAW_CALLS = 180;
export const STRESS_DRAW_CALL_LIMIT = 240;
export const TILE_TEXTURE_ANISOTROPY_CAP = 8;
export const DEFAULT_TILE_TEXTURE_ANISOTROPY = 4;

export function getTileTextureAnisotropy(maxSupported: number): number {
  if (!Number.isFinite(maxSupported)) return 1;
  return Math.max(1, Math.min(TILE_TEXTURE_ANISOTROPY_CAP, Math.floor(maxSupported)));
}
