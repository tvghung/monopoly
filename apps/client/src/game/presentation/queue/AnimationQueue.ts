import type { PresentationEvent } from '../events/types';
import { waitForDelay } from './helpers';
import type {
  AnimationExecutionContext,
  AnimationQueueStatus,
  PresentationExecutor,
  PresentationExecutorMap,
} from './types';

interface QueueItem {
  event: PresentationEvent;
  resolve: () => void;
}

interface AnimationQueueOptions {
  executors: PresentationExecutorMap;
  speedMultiplier?: number;
  reducedMotion?: boolean;
  onError?: (error: unknown, event: PresentationEvent) => void;
  onReset?: (snapshot?: unknown) => void;
}

type QueueListener = (status: AnimationQueueStatus) => void;

export class AnimationQueue {
  private readonly executors: PresentationExecutorMap;
  private readonly onError?: AnimationQueueOptions['onError'];
  private readonly onReset?: AnimationQueueOptions['onReset'];
  private readonly pending: QueueItem[] = [];
  private readonly listeners = new Set<QueueListener>();
  private current: { item: QueueItem; controller: AbortController } | null = null;
  private processing = false;
  private disposed = false;
  private paused = false;
  private status: AnimationQueueStatus = 'idle';
  private speedMultiplier: number;
  private reducedMotion: boolean;
  private idleResolvers: Array<() => void> = [];
  private generation = 0;

  public constructor(options: AnimationQueueOptions) {
    this.executors = options.executors;
    this.speedMultiplier = options.speedMultiplier ?? 1;
    this.reducedMotion = options.reducedMotion ?? false;
    this.onError = options.onError;
    this.onReset = options.onReset;
  }

  public enqueue(event: PresentationEvent): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return new Promise(resolve => {
      this.pending.push({ event, resolve });
      void this.process();
    });
  }

  public enqueueMany(events: PresentationEvent[]): Promise<void>[] {
    return events.map(event => this.enqueue(event));
  }

  public pause(): void {
    if (this.disposed) return;
    this.paused = true;
    this.setStatus('paused');
  }

  public resume(): void {
    if (this.disposed) return;
    this.paused = false;
    if (this.current || this.pending.length > 0) {
      this.setStatus('playing');
      void this.process();
    } else {
      this.setStatus('idle');
    }
  }

  public skipCurrent(): void {
    if (!this.current) return;
    this.setStatus('skipping');
    this.current.controller.abort();
  }

  public skipAll(): void {
    this.setStatus('skipping');
    this.pending.splice(0).forEach(item => item.resolve());
    this.current?.controller.abort();
    if (!this.current) this.setStatus('idle');
  }

  public reset(snapshot?: unknown): void {
    this.setStatus('resetting');
    this.generation += 1;
    this.pending.splice(0).forEach(item => item.resolve());
    this.current?.controller.abort();
    this.paused = false;
    this.onReset?.(snapshot);
    if (!this.current) this.setStatus('idle');
  }

  public setSpeedMultiplier(multiplier: number): void {
    if (!Number.isFinite(multiplier)) return;
    this.speedMultiplier = Math.min(2, Math.max(0.75, multiplier));
  }

  public setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
  }

  public getStatus(): AnimationQueueStatus {
    return this.status;
  }

  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public whenIdle(): Promise<void> {
    if (!this.current && this.pending.length === 0 && this.status === 'idle') return Promise.resolve();
    return new Promise(resolve => this.idleResolvers.push(resolve));
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending.splice(0).forEach(item => item.resolve());
    this.current?.controller.abort();
    this.listeners.clear();
    this.resolveIdle();
  }

  private async process(): Promise<void> {
    if (this.processing || this.disposed) return;
    this.processing = true;
    try {
      while (!this.disposed && this.pending.length > 0) {
        if (this.paused) {
          this.setStatus('paused');
          break;
        }
        const item = this.pending.shift();
        if (!item) break;
        const controller = new AbortController();
        this.current = { item, controller };
        const generation = this.generation;
        this.setStatus('playing');
        const executor = this.executors[item.event.type] as PresentationExecutor | undefined;
        const context: AnimationExecutionContext = {
          signal: controller.signal,
          speedMultiplier: this.speedMultiplier,
          reducedMotion: this.reducedMotion,
          getDuration: baseDuration => this.reducedMotion
            ? 0
            : Math.max(0, baseDuration / this.speedMultiplier),
          wait: baseDuration => waitForDelay(
            this.reducedMotion ? 0 : Math.max(0, baseDuration / this.speedMultiplier),
            controller.signal,
          ),
        };
        try {
          if (executor) await executor.run(item.event, context);
        } catch (error) {
          this.onError?.(error, item.event);
        } finally {
          if (generation === this.generation) {
            try {
              executor?.finish(item.event, context);
            } catch (error) {
              this.onError?.(error, item.event);
            }
          }
          item.resolve();
          this.current = null;
          if (this.paused) this.setStatus('paused');
        }
      }
    } finally {
      this.processing = false;
      if (!this.disposed && !this.current && this.pending.length === 0 && !this.paused) {
        this.setStatus('idle');
        this.resolveIdle();
      }
    }
  }

  private setStatus(status: AnimationQueueStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.listeners.forEach(listener => listener(status));
  }

  private resolveIdle(): void {
    this.idleResolvers.splice(0).forEach(resolve => resolve());
  }
}
