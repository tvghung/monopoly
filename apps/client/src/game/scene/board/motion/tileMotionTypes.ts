import type * as THREE from 'three';

export type TileMotionKind = 'STEP' | 'LAND';

export interface TileImpactSignal {
  sequence: number;
  tileId: number;
  playerId: string;
  kind: TileMotionKind;
}

export interface TileMotionState {
  offsetY: number;
  startOffsetY: number;
  targetOffsetY: number;
  startedAt: number;
  duration: number;
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
