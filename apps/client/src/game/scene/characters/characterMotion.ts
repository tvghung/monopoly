import * as THREE from 'three';
import { presentationTiming } from '../../presentation/timings';

export const CHARACTER_HOP_DURATION_MS = presentationTiming.tileHop;
export const CHARACTER_LANDING_DURATION_MS = presentationTiming.landing;
const CHARACTER_HOP_HEIGHT = 0.22;
const CHARACTER_SHADOW_OPACITY = 0.24;

export interface CharacterMotionSample {
  position: readonly [number, number, number];
  rotationZ: number;
  scaleXZ: number;
  scaleY: number;
  shadowScale: number;
  shadowOpacity: number;
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

export type CharacterTargetTransition = 'SNAP' | 'HOP' | 'NONE';

export function getCharacterTargetTransition(
  previousTileId: number | null,
  nextTileId: number,
  resetChanged: boolean,
  reducedMotion: boolean,
): CharacterTargetTransition {
  if (reducedMotion || resetChanged || previousTileId === null) return 'SNAP';
  if (previousTileId === nextTileId) return 'NONE';
  return 'HOP';
}

export function sampleCharacterMotion(
  elapsedMs: number,
  from: THREE.Vector3,
  to: THREE.Vector3,
): CharacterMotionSample {
  const elapsed = Math.max(0, elapsedMs);
  const hopProgress = Math.min(1, elapsed / CHARACTER_HOP_DURATION_MS);
  const hopEased = 1 - ((1 - hopProgress) ** 3);
  const hopArc = Math.sin(hopProgress * Math.PI);

  if (elapsed < CHARACTER_HOP_DURATION_MS) {
    return {
      position: [
        THREE.MathUtils.lerp(from.x, to.x, hopEased),
        THREE.MathUtils.lerp(from.y, to.y, hopEased) + hopArc * CHARACTER_HOP_HEIGHT,
        THREE.MathUtils.lerp(from.z, to.z, hopEased),
      ],
      rotationZ: (to.x - from.x) * 0.04 * hopArc,
      scaleXZ: 1 + hopArc * 0.025,
      scaleY: 1 - hopArc * 0.045,
      shadowScale: 1 - hopArc * 0.18,
      shadowOpacity: CHARACTER_SHADOW_OPACITY - hopArc * 0.06,
      done: false,
    };
  }

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
