import type * as THREE from 'three';

export type TileMotionKind = 'STEP' | 'LAND';

export interface TileImpactTiming {
  delayMs: number;
  depressDurationMs: number;
  reboundDurationMs: number;
}

export interface TileImpactSignal {
  sequence: number;
  tileId: number;
  playerId: string;
  kind: TileMotionKind;
  delayMs: number;
  depressDurationMs: number;
  reboundDurationMs: number;
}

export interface TileMotionState {
  kind: TileMotionKind;
  offsetY: number;
  startOffsetY: number;
  targetOffsetY: number;
  pressIntensity: number;
  startPressIntensity: number;
  targetPressIntensity: number;
  startedAt: number;
  delayMs: number;
  depressDurationMs: number;
  duration: number;
  reboundDurationMs: number;
  phase: 'WAITING' | 'DEPRESS' | 'REBOUND';
}

export interface TileMotionScheduler {
  now: () => number;
  requestFrame: (callback: (time: number) => void) => number;
  cancelFrame: (handle: number) => void;
}

export interface TileMotionRegistration {
  tileId: number;
  group: THREE.Group;
}
