import { describe, expect, it } from 'vitest';
import {
  DIAGNOSTICS_DEBOUNCE_MS,
  DIAGNOSTICS_MAX_EMPTY_RETRIES,
  DIAGNOSTICS_SETTLE_MS,
  MeasurementScheduler,
  type MeasurementHost,
} from './measurementScheduler';

/** A virtual clock: frames come from the test, timers and animation frames fire only when time is advanced. */
function createHost() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const frames = new Map<number, FrameRequestCallback>();
  const host = {
    invalidations: 0,
    invalidate() { host.invalidations += 1; },
    requestAnimationFrame(callback: FrameRequestCallback) {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id: number) { frames.delete(id); },
    setTimeout(callback: () => void, delayMs: number) {
      const id = nextId++;
      timers.set(id, { at: now + delayMs, callback });
      return id;
    },
    clearTimeout(id: number) { timers.delete(id); },
  } satisfies MeasurementHost & { invalidations: number };
  const flushFrames = () => {
    const pending = [...frames.entries()];
    frames.clear();
    pending.forEach(([, callback]) => callback(now));
  };
  const advance = (ms: number) => {
    const target = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at;
      timers.delete(due[0]);
      due[1].callback();
    }
    now = target;
  };
  return { host, flushFrames, advance, pendingTimers: () => timers.size, pendingFrames: () => frames.size };
}

describe('MeasurementScheduler', () => {
  it('requests only the mount measurements and then goes completely quiet', () => {
    const clock = createHost();
    let published = 0;
    const scheduler = new MeasurementScheduler(clock.host, () => { published += 1; return true; });
    scheduler.start();
    expect(clock.host.invalidations).toBe(1);
    clock.flushFrames();
    clock.flushFrames();
    expect(published).toBe(1);
    clock.advance(DIAGNOSTICS_SETTLE_MS);
    expect(clock.host.invalidations).toBe(2);
    clock.flushFrames();
    clock.flushFrames();
    expect(published).toBe(2);

    // A stable 10 s idle window: the scheduler asks for no frame and keeps no timer or frame request alive.
    const invalidationsAtRest = clock.host.invalidations;
    clock.advance(10_000);
    clock.flushFrames();
    expect(clock.host.invalidations).toBe(invalidationsAtRest);
    expect(clock.pendingTimers()).toBe(0);
    expect(clock.pendingFrames()).toBe(0);
    expect(published).toBe(2);
  });

  it('republishes after a burst of frames the scene rendered itself, without ever asking for a frame', () => {
    const clock = createHost();
    let published = 0;
    const scheduler = new MeasurementScheduler(clock.host, () => { published += 1; return true; });
    scheduler.start();
    clock.flushFrames();
    clock.flushFrames();
    clock.advance(DIAGNOSTICS_SETTLE_MS);
    clock.flushFrames();
    clock.flushFrames();
    const invalidationsBefore = clock.host.invalidations;
    const publishedBefore = published;

    for (let frame = 0; frame < 30; frame += 1) {
      scheduler.noteFrame();
      clock.advance(16);
    }
    expect(published).toBe(publishedBefore);
    clock.advance(DIAGNOSTICS_DEBOUNCE_MS);
    expect(published).toBe(publishedBefore + 1);
    expect(clock.host.invalidations).toBe(invalidationsBefore);
  });

  it('bounds the retries when no frame has been counted yet', () => {
    const clock = createHost();
    const scheduler = new MeasurementScheduler(clock.host, () => false);
    scheduler.start();
    clock.flushFrames();
    clock.flushFrames();
    for (let attempt = 0; attempt < 50; attempt += 1) scheduler.noteFrame();
    for (let attempt = 0; attempt < 50; attempt += 1) {
      clock.advance(DIAGNOSTICS_DEBOUNCE_MS);
      scheduler.noteFrame();
    }
    // One invalidation at mount, then at most DIAGNOSTICS_MAX_EMPTY_RETRIES retries before the settled measurement.
    expect(clock.host.invalidations).toBeLessThanOrEqual(1 + DIAGNOSTICS_MAX_EMPTY_RETRIES + 1);
  });

  it('cancels everything on dispose', () => {
    const clock = createHost();
    let published = 0;
    const scheduler = new MeasurementScheduler(clock.host, () => { published += 1; return true; });
    scheduler.start();
    scheduler.noteFrame();
    scheduler.dispose();
    clock.flushFrames();
    clock.advance(10_000);
    scheduler.noteFrame();
    clock.advance(10_000);
    expect(published).toBe(0);
    expect(clock.pendingTimers()).toBe(0);
    expect(clock.host.invalidations).toBe(1);
  });
});
