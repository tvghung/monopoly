import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_HOP_DURATION_MS,
  CHARACTER_LANDING_DURATION_MS,
  sampleCharacterMotion,
} from './characterMotion';

describe('character motion samples', () => {
  it('adds a restrained hop arc and lighter, smaller apex shadow', () => {
    const sample = sampleCharacterMotion(
      CHARACTER_HOP_DURATION_MS / 2,
      new THREE.Vector3(0, 0.6, 0),
      new THREE.Vector3(1, 0.6, 1),
    );

    expect(sample.position[1]).toBeGreaterThan(0.6);
    expect(sample.position[0]).toBeGreaterThan(0);
    expect(sample.position[2]).toBeGreaterThan(0);
    expect(sample.shadowScale).toBeLessThan(1);
    expect(sample.shadowOpacity).toBeLessThan(0.24);
    expect(sample.done).toBe(false);
  });

  it('returns authoritative destination and completes after landing feedback', () => {
    const sample = sampleCharacterMotion(
      CHARACTER_HOP_DURATION_MS + CHARACTER_LANDING_DURATION_MS,
      new THREE.Vector3(0, 0.6, 0),
      new THREE.Vector3(1, 0.6, 1),
    );

    expect(sample.position).toEqual([1, 0.6, 1]);
    expect(sample.rotationZ).toBe(0);
    expect(sample.scaleXZ).toBe(1);
    expect(sample.scaleY).toBe(1);
    expect(sample.done).toBe(true);
  });
});
