export const DIAGNOSTICS_DEBOUNCE_MS = 120;
export const DIAGNOSTICS_SETTLE_MS = 650;
/** A publish that finds no counted frame asks for one more frame, but never more than this many times in a row. */
export const DIAGNOSTICS_MAX_EMPTY_RETRIES = 5;

export interface MeasurementHost {
  invalidate: () => void;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (id: number) => void;
  setTimeout: (callback: () => void, delayMs: number) => number;
  clearTimeout: (id: number) => void;
}

/**
 * Decides when the dev/UAT renderer diagnostics are published. It observes the scene; it must never drive it:
 * after the two measurement frames requested at mount (`start`) it asks for a frame only when a publish found nothing
 * counted yet, and then at most `DIAGNOSTICS_MAX_EMPTY_RETRIES` times. Every later publish is triggered by a frame the
 * scene rendered for its own reasons (`noteFrame`), debounced until the frames go quiet. That is the property that lets a
 * demand-rendered scene reach zero submissions at rest while the diagnostics are on (Phase A finding PERF-17).
 */
export class MeasurementScheduler {
  private firstFrameId = 0;
  private measurementFrameId = 0;
  private settleTimerId = 0;
  private debounceTimerId = 0;
  private emptyRetries = 0;
  private disposed = false;

  /** `publish` returns false when no scene frame has been counted yet. */
  constructor(
    private readonly host: MeasurementHost,
    private readonly publish: () => boolean,
  ) {}

  /** Requests the initial measurement, plus one settled measurement after async completions (SDF text, textures). */
  start(): void {
    this.measureAfterRender();
    this.settleTimerId = this.host.setTimeout(() => this.measureAfterRender(), DIAGNOSTICS_SETTLE_MS);
  }

  /** Called after every main scene render; republishes once frames go quiet. Never requests a frame. */
  noteFrame(): void {
    if (this.disposed) return;
    this.host.clearTimeout(this.debounceTimerId);
    this.debounceTimerId = this.host.setTimeout(() => this.publishNow(), DIAGNOSTICS_DEBOUNCE_MS);
  }

  dispose(): void {
    this.disposed = true;
    this.host.clearTimeout(this.debounceTimerId);
    this.host.clearTimeout(this.settleTimerId);
    this.host.cancelAnimationFrame(this.firstFrameId);
    this.host.cancelAnimationFrame(this.measurementFrameId);
  }

  private measureAfterRender(): void {
    if (this.disposed) return;
    this.host.invalidate();
    this.firstFrameId = this.host.requestAnimationFrame(() => {
      this.measurementFrameId = this.host.requestAnimationFrame(() => this.publishNow());
    });
  }

  private publishNow(): void {
    if (this.disposed) return;
    if (this.publish()) {
      this.emptyRetries = 0;
      return;
    }
    if (this.emptyRetries < DIAGNOSTICS_MAX_EMPTY_RETRIES) {
      this.emptyRetries += 1;
      this.host.invalidate();
    }
  }
}
