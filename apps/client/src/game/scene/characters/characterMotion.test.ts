import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_HOP_DURATION_MS,
  getCharacterGroundingTransforms,
  getCharacterTargetTransition,
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

  it('arrives exactly at hop completion so LAND owns the separate rebound timeline', () => {
    const sample = sampleCharacterMotion(
      CHARACTER_HOP_DURATION_MS,
      new THREE.Vector3(0, 0.6, 0),
      new THREE.Vector3(1, 0.6, 1),
    );

    expect(sample.position).toEqual([1, 0.6, 1]);
    expect(sample.rotationZ).toBe(0);
    expect(sample.scaleXZ).toBe(1);
    expect(sample.scaleY).toBe(1);
    expect(sample.done).toBe(true);
  });

  it('does not start a zero-distance hop when only tile feedback changes', () => {
    expect(getCharacterTargetTransition(4, 4, false, false)).toBe('NONE');
    expect(getCharacterTargetTransition(4, 5, false, false)).toBe('HOP');
    expect(getCharacterTargetTransition(4, 5, true, false)).toBe('SNAP');
    expect(getCharacterTargetTransition(4, 5, false, true)).toBe('SNAP');
  });

  it('keeps the active ring and contact shadow grounded while the body arcs', () => {
    const transforms = getCharacterGroundingTransforms([1, 0.94, 2], 0.6, 0.04);

    expect(transforms.root).toEqual([1, 0, 2]);
    expect(transforms.ground).toEqual([0, 0.64, 0]);
    expect(transforms.body).toEqual([0, 0.94, 0]);
  });
});
