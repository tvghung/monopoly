import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_HOP_DURATION_MS,
  getCharacterBodyTileOffsetY,
  getCharacterGroundingTransforms,
  getCharacterTravelLean,
  getCharacterTargetTransition,
  sampleCharacterHop,
  sampleCharacterLanding,
  sampleCharacterMotion,
  sampleCharacterSlotReflow,
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
    expect(getCharacterTargetTransition(4, 5, false, false)).toBe('TILE_HOP');
    expect(getCharacterTargetTransition(4, 4, false, false, true)).toBe('SLOT_REFLOW');
    expect(getCharacterTargetTransition(4, 5, true, false)).toBe('SNAP');
    expect(getCharacterTargetTransition(4, 5, false, true)).toBe('SNAP');
  });

  it('uses the resolved duration and exact canonical completion for every hop speed', () => {
    const from = new THREE.Vector3(0, 0.6, 0);
    const to = new THREE.Vector3(1, 0.6, 0);
    expect(sampleCharacterHop(90, from, to, 90)).toMatchObject({
      position: [1, 0.6, 0],
      rotationZ: 0,
      scaleXZ: 1,
      scaleY: 1,
      shadowScale: 1,
      shadowOpacity: 0.24,
      done: true,
    });
    expect(sampleCharacterHop(239, from, to, 240).done).toBe(false);
  });

  it('keeps slot reflow grounded and landing physics neutral', () => {
    const reflow = sampleCharacterSlotReflow(
      55,
      new THREE.Vector3(0, 0.6, 0),
      new THREE.Vector3(0.28, 0.6, 0),
      110,
    );
    expect(reflow.position[1]).toBe(0.6);
    expect(reflow.scaleY).toBe(1);
    expect(reflow.shadowScale).toBe(1);
    expect(reflow.rotationZ).toBe(0);

    const landing = sampleCharacterLanding(60, 120);
    expect(landing.scaleY).toBeLessThan(1);
    expect(landing.scaleX).toBeGreaterThan(1);
    expect(sampleCharacterLanding(120, 120)).toEqual({
      offsetY: 0,
      rotationZ: 0,
      scaleX: 1,
      scaleY: 1,
      done: true,
    });
  });

  it('projects travel onto camera right so all four board directions can lean', () => {
    const directions = [
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)],
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-1, 0, 0)],
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)],
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)],
    ] as const;
    expect(directions.map(([from, to]) => getCharacterTravelLean(from, to).toFixed(6)))
      .toEqual(['0.019799', '-0.019799', '-0.019799', '0.019799']);
  });

  it('keeps the contact shadow grounded while the body arcs', () => {
    const transforms = getCharacterGroundingTransforms([1, 0.94, 2], 0.6, 0.04);

    expect(transforms.root).toEqual([1, 0, 2]);
    expect(transforms.ground).toEqual([0, 0.64, 0]);
    expect(transforms.body).toEqual([0, 0.94, 0]);
  });

  it('attaches grounded bodies to a depressed tile without moving airborne hops', () => {
    expect(getCharacterBodyTileOffsetY(-0.046, false)).toBe(-0.046);
    expect(getCharacterBodyTileOffsetY(-0.046, true)).toBe(0);
  });
});
