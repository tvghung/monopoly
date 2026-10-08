/**
 * Seeded randomness for bot tie-breaks. The seed is built from the decision's own public identity (room, match, turn, roll,
 * bot, decision kind), so the same state always gives the same choice and a test fixture reproduces exactly. It is never used
 * for dice or cards: those stay on the authoritative random path every player shares.
 */
export type BotRandom = () => number;

/** FNV-1a 32-bit hash of a string. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: a small, fast PRNG with a 32-bit state; values in [0, 1). */
export function mulberry32(seed: number): BotRandom {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export const seededRandom = (...parts: Array<string | number>): BotRandom => mulberry32(hashSeed(parts.join('|')));
