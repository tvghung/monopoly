import type { PresentationEvent, PresentationEventType } from '../events/types';

export type AnimationQueueStatus = 'idle' | 'playing' | 'paused' | 'skipping' | 'resetting';

export interface AnimationExecutionContext {
  signal: AbortSignal;
  speedMultiplier: number;
  reducedMotion: boolean;
  getDuration: (baseDuration: number) => number;
  wait: (baseDuration: number) => Promise<void>;
  /** Wait for a duration that has already been resolved by this context. */
  waitForDuration: (durationMs: number) => Promise<void>;
  /** True while the queue generation that started this executor is current. */
  isCurrent?: () => boolean;
}

export interface PresentationExecutor<E extends PresentationEvent = PresentationEvent> {
  run: (event: E, context: AnimationExecutionContext) => Promise<void>;
  finish: (event: E, context: AnimationExecutionContext) => void;
}

export type PresentationExecutorMap = Partial<Record<PresentationEventType, PresentationExecutor<never>>>;
