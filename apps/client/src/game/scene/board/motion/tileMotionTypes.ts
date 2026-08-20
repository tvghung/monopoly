import type * as THREE from 'three';

export type TileMotionKind = 'STEP' | 'LAND';

export interface TileImpactTiming {
  depressDurationMs: number;
  reboundDurationMs: number;
}

export interface TileImpactSignal {
  sequence: number;
  tileId: number;
  playerId: string;
  kind: TileMotionKind;
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
  duration: number;
  reboundDurationMs: number;
  phase: 'DEPRESS' | 'REBOUND';
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
