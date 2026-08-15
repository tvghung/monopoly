import type { PresentationEvent, PresentationEventType } from '../events/types';

export type AnimationQueueStatus = 'idle' | 'playing' | 'paused' | 'skipping' | 'resetting';

export interface AnimationExecutionContext {
  signal: AbortSignal;
  speedMultiplier: number;
  reducedMotion: boolean;
  getDuration: (baseDuration: number) => number;
  wait: (baseDuration: number) => Promise<void>;
}

export interface PresentationExecutor<E extends PresentationEvent = PresentationEvent> {
  run: (event: E, context: AnimationExecutionContext) => Promise<void>;
  finish: (event: E, context: AnimationExecutionContext) => void;
}

export type PresentationExecutorMap = Partial<Record<PresentationEventType, PresentationExecutor<never>>>;
