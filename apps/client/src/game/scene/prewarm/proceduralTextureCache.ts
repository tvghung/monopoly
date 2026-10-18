/**
 * Procedural texture data prepared ahead of the board (Phase B3 follow-up, 08H Task 1). The table, the district surfaces and the white
 * pebbles are generated on the CPU when their layers mount, about 0.4 s of the first 2 s of the board on the reference machine;
 * their inputs are constants, so the lobby can generate them while the machine is idle. The generators are pure and guarded byte for
 * byte by `proceduralTextureGolden.test.ts`, so a prepared result and a fresh one are the same bytes.
 *
 * Ownership: an entry is **taken** (removed) by the one consumer that builds a texture from it, so the cache never holds a second copy
 * of what a texture already holds, and a second mount (a tier change, play again) generates as before. Entries nobody takes (the
 * player left the lobby without starting) are dropped by `releaseProceduralTextureCache`, called when the session ends.
 *
 * This module imports no generator on purpose: the consumers import it, and the generators import nothing from here.
 */
const entries = new Map<string, unknown>();

export const tableTextureKey = (size: number, roughnessVariation: boolean): string => `table:${size}:${roughnessVariation ? 'rough' : 'plain'}`;
export const districtTextureKey = (surfaceKey: string): string => `district:${surfaceKey}`;
export const pebbleTextureKey = (variant: number): string => `pebble:${variant}`;

export function putProceduralTexture(key: string, value: unknown): void {
  entries.set(key, value);
}

export function hasProceduralTexture(key: string): boolean {
  return entries.has(key);
}

/** Removes and returns the prepared data, or undefined when none was prepared (the caller then generates it itself). */
export function takeProceduralTexture<T>(key: string): T | undefined {
  const value = entries.get(key) as T | undefined;
  entries.delete(key);
  return value;
}

export function proceduralTextureCacheSize(): number {
  return entries.size;
}

export function releaseProceduralTextureCache(): void {
  entries.clear();
}
