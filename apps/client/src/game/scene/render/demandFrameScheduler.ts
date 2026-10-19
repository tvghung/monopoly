export interface FrameSchedulerHost {
  now: () => number;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (id: number) => void;
  setTimeout: (callback: () => void, delayMs: number) => number;
  clearTimeout: (id: number) => void;
  isVisible: () => boolean;
  onVisibilityChange: (callback: () => void) => () => void;
}

const browserHost: FrameSchedulerHost = {
  now: () => performance.now(),
  requestAnimationFrame: callback => window.requestAnimationFrame(callback),
  cancelAnimationFrame: id => window.cancelAnimationFrame(id),
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: id => window.clearTimeout(id),
  isVisible: () => !document.hidden,
  onVisibilityChange: callback => {
    document.addEventListener('visibilitychange', callback);
    return () => document.removeEventListener('visibilitychange', callback);
  },
};

/** Coalesces R3F invalidations into one visibility-aware, rate-limited frame stream. */
export class DemandFrameScheduler {
  private pendingFrames = 0;
  private lastFrameAt: number | null = null;
  private nextFrameAt: number | null = null;
  private frameId: number | null = null;
  private timeoutId: number | null = null;
  private inFrame = false;
  private disposed = false;
  private holds = 0;
  private readonly removeVisibilityListener: () => void;

  constructor(
    private fpsLimit: number,
    private readonly advance: (timestampSeconds: number) => void,
    private readonly host: FrameSchedulerHost = browserHost,
    private readonly onIdle: (timestampMs: number) => void = () => {},
  ) {
    this.removeVisibilityListener = host.onVisibilityChange(() => {
      if (host.isVisible()) this.schedule();
      else {
        this.cancelScheduled();
        this.lastFrameAt = null;
        this.nextFrameAt = null;
      }
    });
  }

  readonly invalidate = (frames = 1): void => {
    if (this.disposed || !Number.isFinite(frames) || frames <= 0) return;
    this.pendingFrames = frames > 1
      ? Math.min(60, this.pendingFrames + Math.floor(frames))
      : Math.max(this.pendingFrames, this.inFrame ? 2 : 1);
    this.schedule();
  };

  /**
   * Stops frames from being produced until the returned release function is called (shader warm-up). Invalidations made
   * meanwhile are kept, so the first frame after the last release draws the latest state. Holds nest; each release is
   * idempotent.
   */
  hold(): () => void {
    this.holds += 1;
    this.cancelScheduled();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holds = Math.max(0, this.holds - 1);
      this.schedule();
    };
  }

  get isHeld(): boolean {
    return this.holds > 0;
  }

  setFpsLimit(fpsLimit: number): void {
    if (this.disposed || fpsLimit === this.fpsLimit) return;
    this.fpsLimit = fpsLimit;
    this.nextFrameAt = this.lastFrameAt === null ? null : this.lastFrameAt + 1000 / fpsLimit;
    this.cancelScheduled();
    this.schedule();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingFrames = 0;
    this.cancelScheduled();
    this.removeVisibilityListener();
  }

  private schedule(): void {
    if (this.disposed || this.holds > 0 || this.pendingFrames === 0 || this.frameId !== null || this.timeoutId !== null
      || !this.host.isVisible()) return;
    // Stay subscribed to display ticks during an active burst. A timeout followed by RAF can miss
    // the very tick it was waiting for, especially on non-divisor refresh rates.
    this.requestFrame();
  }

  private requestFrame(): void {
    if (this.disposed || this.frameId !== null || !this.host.isVisible()) return;
    this.frameId = this.host.requestAnimationFrame(timestamp => {
      this.frameId = null;
      if (this.disposed || !this.host.isVisible()) return;
      if (this.nextFrameAt !== null && timestamp + 0.5 < this.nextFrameAt) {
        this.schedule();
        return;
      }
      const period = 1000 / this.fpsLimit;
      // Preserve fractional refresh phases rather than starting a new interval at every actual
      // vsync. Rebase after a long stall so missed frames never cause a catch-up burst.
      this.nextFrameAt = this.nextFrameAt === null || timestamp - this.nextFrameAt > period
        ? timestamp + period
        : this.nextFrameAt + period;
      this.lastFrameAt = timestamp;
      this.inFrame = true;
      try {
        this.advance(timestamp / 1000);
      } finally {
        this.inFrame = false;
        this.pendingFrames = Math.max(0, this.pendingFrames - 1);
        if (this.pendingFrames === 0) this.onIdle(timestamp);
        this.schedule();
      }
    });
  }

  private cancelScheduled(): void {
    if (this.frameId !== null) this.host.cancelAnimationFrame(this.frameId);
    if (this.timeoutId !== null) this.host.clearTimeout(this.timeoutId);
    this.frameId = null;
    this.timeoutId = null;
  }
}
