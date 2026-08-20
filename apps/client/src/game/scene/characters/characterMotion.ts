import * as THREE from 'three';
import { CAMERA_RIGHT } from '../camera/cameraMath';
import { presentationTiming } from '../../presentation/timings';
import type { CharacterTransition } from '../../presentation/store/types';

export const CHARACTER_HOP_DURATION_MS = presentationTiming.tileHop;
export const CHARACTER_SLOT_REFLOW_DURATION_MS = presentationTiming.slotReflow;
export const CHARACTER_LANDING_DURATION_MS = presentationTiming.landing;
export const CHARACTER_HOP_HEIGHT = 0.22;
export const CHARACTER_SHADOW_OPACITY = 0.24;

const CHARACTER_LEAN_MAX_RADIANS = THREE.MathUtils.degToRad(3);
const CHARACTER_LEAN_PER_SCREEN_UNIT = 0.028;
const CONTACT_EASE_AMPLITUDE = 0.028;

export interface CharacterMotionSample {
  position: readonly [number, number, number];
  rotationZ: number;
  scaleXZ: number;
  scaleY: number;
  shadowScale: number;
  shadowOpacity: number;
  done: boolean;
}

export interface CharacterLandingSample {
  offsetY: number;
  rotationZ: number;
  scaleX: number;
  scaleY: number;
  done: boolean;
}

export interface CharacterGroundingTransforms {
  root: readonly [number, number, number];
  ground: readonly [number, number, number];
  body: readonly [number, number, number];
}

export function getCharacterGroundingTransforms(
  bodyPosition: readonly [number, number, number],
  groundY: number,
  tileMotionOffsetY: number,
): CharacterGroundingTransforms {
  return {
    root: [bodyPosition[0], 0, bodyPosition[2]],
    ground: [0, groundY + tileMotionOffsetY, 0],
    body: [0, bodyPosition[1], 0],
  };
}

export type CharacterTargetTransition = CharacterTransition;

export function getCharacterTargetTransition(
  previousTileId: number | null,
  nextTileId: number,
  resetChanged: boolean,
  reducedMotion: boolean,
  anchorChanged = false,
): CharacterTargetTransition {
  if (reducedMotion || resetChanged || previousTileId === null) return 'SNAP';
  if (previousTileId !== nextTileId) return 'TILE_HOP';
  if (anchorChanged) return 'SLOT_REFLOW';
  return 'NONE';
}

export function getCharacterTravelLean(
  from: THREE.Vector3,
  to: THREE.Vector3,
): number {
  const projectedTravel = (to.x - from.x) * CAMERA_RIGHT[0]
    + (to.z - from.z) * CAMERA_RIGHT[2];
  return THREE.MathUtils.clamp(
    projectedTravel * CHARACTER_LEAN_PER_SCREEN_UNIT,
    -CHARACTER_LEAN_MAX_RADIANS,
    CHARACTER_LEAN_MAX_RADIANS,
  );
}

function progressFor(elapsedMs: number, durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1;
  return THREE.MathUtils.clamp(elapsedMs / durationMs, 0, 1);
}

function smoothStep(value: number): number {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

/** Near-linear travel with a small contact ease, avoiding a full brake at each tile. */
function sampleTravelProgress(progress: number): number {
  if (progress <= 0 || progress >= 1) return progress;
  return progress + CONTACT_EASE_AMPLITUDE * Math.sin(progress * Math.PI * 2);
}

export function sampleCharacterHop(
  elapsedMs: number,
  from: THREE.Vector3,
  to: THREE.Vector3,
  durationMs: number = CHARACTER_HOP_DURATION_MS,
): CharacterMotionSample {
  const progress = progressFor(Math.max(0, elapsedMs), durationMs);
  if (progress >= 1) {
    return {
      position: [to.x, to.y, to.z],
      rotationZ: 0,
      scaleXZ: 1,
      scaleY: 1,
      shadowScale: 1,
      shadowOpacity: CHARACTER_SHADOW_OPACITY,
      done: true,
    };
  }

  const travelProgress = sampleTravelProgress(progress);
  const arc = Math.sin(progress * Math.PI);
  const takeoffStretch = Math.sin(Math.min(1, progress / 0.24) * Math.PI);
  const contactSquash = smoothStep((progress - 0.78) / 0.22);
  const lean = getCharacterTravelLean(from, to);

  return {
    position: [
      THREE.MathUtils.lerp(from.x, to.x, travelProgress),
      THREE.MathUtils.lerp(from.y, to.y, travelProgress) + arc * CHARACTER_HOP_HEIGHT,
      THREE.MathUtils.lerp(from.z, to.z, travelProgress),
    ],
    rotationZ: lean * arc,
    scaleXZ: 1 - takeoffStretch * 0.01 + contactSquash * 0.025,
    scaleY: 1 + takeoffStretch * 0.022 - contactSquash * 0.045,
    shadowScale: 1 - arc * 0.18,
    shadowOpacity: CHARACTER_SHADOW_OPACITY - arc * 0.055,
    done: false,
  };
}

/** A same-tile anchor change remains grounded and never receives a hop arc. */
export function sampleCharacterSlotReflow(
  elapsedMs: number,
  from: THREE.Vector3,
  to: THREE.Vector3,
  durationMs: number = CHARACTER_SLOT_REFLOW_DURATION_MS,
): CharacterMotionSample {
  const progress = progressFor(Math.max(0, elapsedMs), durationMs);
  const travelProgress = sampleTravelProgress(progress);
  const done = progress >= 1;
  return {
    position: done
      ? [to.x, to.y, to.z]
      : [
        THREE.MathUtils.lerp(from.x, to.x, travelProgress),
        THREE.MathUtils.lerp(from.y, to.y, travelProgress),
        THREE.MathUtils.lerp(from.z, to.z, travelProgress),
      ],
    rotationZ: 0,
    scaleXZ: 1,
    scaleY: 1,
    shadowScale: 1,
    shadowOpacity: CHARACTER_SHADOW_OPACITY,
    done,
  };
}

/** Neutral physical contact feedback. Semantic reactions are intentionally separate. */
export function sampleCharacterLanding(
  elapsedMs: number,
  durationMs: number = CHARACTER_LANDING_DURATION_MS,
): CharacterLandingSample {
  const progress = progressFor(Math.max(0, elapsedMs), durationMs);
  if (progress >= 1) {
    return { offsetY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, done: true };
  }
  const contactWave = Math.sin(progress * Math.PI);
  const reboundWave = Math.sin(progress * Math.PI * 2);
  return {
    offsetY: reboundWave * 0.016,
    rotationZ: reboundWave * 0.018,
    scaleX: 1 + contactWave * 0.025,
    scaleY: 1 - contactWave * 0.04,
    done: false,
  };
}

/** Backwards-compatible name for callers that sample the default hop duration. */
export function sampleCharacterMotion(
  elapsedMs: number,
  from: THREE.Vector3,
  to: THREE.Vector3,
): CharacterMotionSample {
  return sampleCharacterHop(elapsedMs, from, to, CHARACTER_HOP_DURATION_MS);
}
