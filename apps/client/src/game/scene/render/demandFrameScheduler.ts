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
  private frameId: number | null = null;
  private timeoutId: number | null = null;
  private inFrame = false;
  private disposed = false;
  private readonly removeVisibilityListener: () => void;

  constructor(
    private fpsLimit: number,
    private readonly advance: (timestampSeconds: number) => void,
    private readonly host: FrameSchedulerHost = browserHost,
    private readonly onIdle: (timestampMs: number) => void = () => {},
  ) {
    this.removeVisibilityListener = host.onVisibilityChange(() => {
      if (host.isVisible()) this.schedule();
      else this.cancelScheduled();
    });
  }

  readonly invalidate = (frames = 1): void => {
    if (this.disposed || !Number.isFinite(frames) || frames <= 0) return;
    this.pendingFrames = frames > 1
      ? Math.min(60, this.pendingFrames + Math.floor(frames))
      : Math.max(this.pendingFrames, this.inFrame ? 2 : 1);
    this.schedule();
  };

  setFpsLimit(fpsLimit: number): void {
    if (this.disposed || fpsLimit === this.fpsLimit) return;
    this.fpsLimit = fpsLimit;
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
    if (this.disposed || this.pendingFrames === 0 || this.frameId !== null || this.timeoutId !== null
      || !this.host.isVisible()) return;
    const dueAt = this.lastFrameAt === null ? this.host.now() : this.lastFrameAt + 1000 / this.fpsLimit;
    const delay = dueAt - this.host.now() - 1;
    if (delay > 0) {
      this.timeoutId = this.host.setTimeout(() => {
        this.timeoutId = null;
        this.requestFrame();
      }, delay);
      return;
    }
    this.requestFrame();
  }

  private requestFrame(): void {
    if (this.disposed || this.frameId !== null || !this.host.isVisible()) return;
    this.frameId = this.host.requestAnimationFrame(timestamp => {
      this.frameId = null;
      if (this.disposed || !this.host.isVisible()) return;
      const dueAt = this.lastFrameAt === null ? timestamp : this.lastFrameAt + 1000 / this.fpsLimit;
      if (timestamp + 0.5 < dueAt) {
        this.schedule();
        return;
      }
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
