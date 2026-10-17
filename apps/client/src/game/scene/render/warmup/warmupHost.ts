import { createContext } from 'react';
import type * as THREE from 'three';

/**
 * The high tier's post-processing chain as the warm-up needs it: the buffer the scene is drawn into (programs are keyed on the
 * target they draw into) and the passes whose own programs must be ready.
 */
export interface PostChain {
  inputBuffer: THREE.WebGLRenderTarget;
  passes: ReadonlyArray<{ enabled: boolean; name: string }>;
}

/** What the warm-up component asks of the scene while it compiles: no frame is drawn until it releases. */
export interface WarmupHost {
  /** The chain mounted by `ScenePostEffects` (it loads lazily, so it can arrive after the warm-up started), or null. */
  registerPostChain(chain: PostChain | null): void;
  /** Resolves with the registered chain, or null when none arrived in time or the signal aborted. */
  waitForPostChain(signal: AbortSignal, timeoutMs: number): Promise<PostChain | null>;
  /** Idempotent: stops the frame stream (the picture on screen stays as it is). */
  hold(): void;
  /** Idempotent: lets the frame stream resume; the first frame draws the latest state. */
  release(): void;
}

/** A host that does nothing, for a scene without a frame scheduler (tests, previews). */
export const NO_WARMUP_HOST: WarmupHost = {
  hold() {},
  release() {},
  registerPostChain() {},
  waitForPostChain: () => Promise.resolve(null),
};

export const WarmupHostContext = createContext<WarmupHost>(NO_WARMUP_HOST);

interface SchedulerHold {
  hold(): () => void;
}

export interface FrameWarmupHostOptions {
  /** Last resort: the frames resume after this long even if the warm-up never reported back. */
  watchdogMs: number;
  /** Called once per hold that the watchdog ended. */
  onWatchdog?: () => void;
  /**
   * True when a canvas has been attached and nothing has been drawn yet, false from the first release on (a later hold, such as a
   * tier switch, keeps the picture on screen and is not reported): the scene's loading indicator follows it.
   */
  onInitialPendingChange?: (pending: boolean) => void;
  setTimeout?: (callback: () => void, delayMs: number) => unknown;
  clearTimeout?: (id: unknown) => void;
}

/**
 * Holds the demand frame scheduler for the shader warm-up. The scene must not draw its first frame before the programs it
 * needs are ready (that frame is where a cold launch froze for seconds), but a warm-up that never finishes must not keep the
 * board blank either: a watchdog ends the hold and the scene then compiles on first use exactly as it did before the warm-up.
 */
export class FrameWarmupHost implements WarmupHost {
  private scheduler: SchedulerHold | null = null;
  private releaseScheduler: (() => void) | null = null;
  private postChain: PostChain | null = null;
  private initialPending = false;
  private initialReported = false;
  private readonly postChainWaiters = new Set<(chain: PostChain | null) => void>();
  private watchdog: unknown = null;
  private readonly schedule: NonNullable<FrameWarmupHostOptions['setTimeout']>;
  private readonly cancel: NonNullable<FrameWarmupHostOptions['clearTimeout']>;

  constructor(private readonly options: FrameWarmupHostOptions) {
    this.schedule = options.setTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.cancel = options.clearTimeout ?? (id => clearTimeout(id as ReturnType<typeof setTimeout>));
  }

  /** Binds the scheduler of a new canvas. Frames are held from the start: nothing is drawn before the first warm-up ends. */
  attach(scheduler: SchedulerHold | null): void {
    this.dropHold();
    this.scheduler = scheduler;
    if (scheduler) {
      this.acquire();
      if (!this.initialReported && !this.initialPending) {
        this.initialPending = true;
        this.options.onInitialPendingChange?.(true);
      }
    }
  }

  registerPostChain(chain: PostChain | null): void {
    this.postChain = chain;
    if (chain) for (const waiter of [...this.postChainWaiters]) waiter(chain);
  }

  waitForPostChain(signal: AbortSignal, timeoutMs: number): Promise<PostChain | null> {
    if (this.postChain) return Promise.resolve(this.postChain);
    return new Promise(resolve => {
      const settle = (chain: PostChain | null) => {
        this.postChainWaiters.delete(settle);
        this.cancel(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(chain);
      };
      const onAbort = () => settle(null);
      const timer = this.schedule(() => settle(null), timeoutMs);
      this.postChainWaiters.add(settle);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  hold(): void {
    this.acquire();
  }

  release(): void {
    this.dropHold();
    this.finishInitial();
  }

  dispose(): void {
    this.dropHold();
    this.finishInitial();
    this.scheduler = null;
    this.postChain = null;
    for (const waiter of [...this.postChainWaiters]) waiter(null);
  }

  private finishInitial(): void {
    if (!this.initialPending) return;
    this.initialPending = false;
    this.initialReported = true;
    this.options.onInitialPendingChange?.(false);
  }

  private acquire(): void {
    if (!this.scheduler || this.releaseScheduler) return;
    this.releaseScheduler = this.scheduler.hold();
    this.watchdog = this.schedule(() => {
      this.watchdog = null;
      this.options.onWatchdog?.();
      this.release();
    }, this.options.watchdogMs);
  }

  private dropHold(): void {
    if (this.watchdog !== null) this.cancel(this.watchdog);
    this.watchdog = null;
    const release = this.releaseScheduler;
    this.releaseScheduler = null;
    release?.();
  }
}
