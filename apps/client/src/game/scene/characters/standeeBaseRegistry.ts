import type * as THREE from 'three';

/**
 * The bases of all standees are drawn as one instanced mesh (plan 05 §8.4: 1 draw instead of one per player). Each standee
 * registers an anchor object inside its body group here; the instanced mesh follows the anchors' world matrices, so a base
 * hops, leans and moves with its card without owning any motion code.
 */
export interface StandeeBaseEntry {
  /** An empty object at the foot of the standee, inside the body group. */
  anchor: THREE.Object3D;
  /** The player's display color (hex). */
  color: string;
}

const entries = new Map<symbol, StandeeBaseEntry>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach(listener => listener());
}

/** Registers (or updates) one standee base; the returned function removes it. */
export function registerStandeeBase(key: symbol, entry: StandeeBaseEntry): () => void {
  entries.set(key, entry);
  notify();
  return () => {
    if (entries.delete(key)) notify();
  };
}

export function getStandeeBaseEntries(): readonly StandeeBaseEntry[] {
  return [...entries.values()];
}

export function subscribeStandeeBases(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function resetStandeeBasesForTests(): void {
  entries.clear();
  listeners.clear();
}
