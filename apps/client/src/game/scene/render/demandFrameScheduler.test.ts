import { describe, expect, it, vi } from 'vitest';
import { DemandFrameScheduler, type FrameSchedulerHost } from './demandFrameScheduler';

class FakeFrameHost implements FrameSchedulerHost {
  time = 0;
  visible = true;
  nextId = 1;
  frames = new Map<number, FrameRequestCallback>();
  timers = new Map<number, { dueAt: number; callback: () => void }>();
  visibilityListeners = new Set<() => void>();

  now = () => this.time;
  requestAnimationFrame = (callback: FrameRequestCallback) => {
    const id = this.nextId++;
    this.frames.set(id, callback);
    return id;
  };
  cancelAnimationFrame = (id: number) => { this.frames.delete(id); };
  setTimeout = (callback: () => void, delayMs: number) => {
    const id = this.nextId++;
    this.timers.set(id, { dueAt: this.time + delayMs, callback });
    return id;
  };
  clearTimeout = (id: number) => { this.timers.delete(id); };
  isVisible = () => this.visible;
  onVisibilityChange = (callback: () => void) => {
    this.visibilityListeners.add(callback);
    return () => this.visibilityListeners.delete(callback);
  };

  advanceTo(time: number): void {
    while (true) {
      const due = [...this.timers.entries()].find(([, timer]) => timer.dueAt <= time);
      if (!due) break;
      const [id, timer] = due;
      this.time = timer.dueAt;
      this.timers.delete(id);
      timer.callback();
    }
    this.time = time;
  }

  renderAt(timestamp: number): void {
    this.time = timestamp;
    const callbacks = [...this.frames.values()];
    this.frames.clear();
    callbacks.forEach(callback => callback(timestamp));
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.visibilityListeners.forEach(listener => listener());
  }
}

describe('DemandFrameScheduler', () => {
  it('coalesces invalidations and keeps an idle scene stopped', () => {
    const host = new FakeFrameHost();
    const advance = vi.fn();
    const scheduler = new DemandFrameScheduler(60, advance, host);

    scheduler.invalidate();
    scheduler.invalidate();
    scheduler.invalidate();
    expect(host.frames.size).toBe(1);
    host.renderAt(16.7);

    expect(advance).toHaveBeenCalledTimes(1);
    expect(advance).toHaveBeenCalledWith(0.0167);
    expect(host.frames.size).toBe(0);
    expect(host.timers.size).toBe(0);
    scheduler.dispose();
  });

  it('paces active animation at 30 FPS and keeps elapsed time independent of frame count', () => {
    const host = new FakeFrameHost();
    const timestamps: number[] = [];
    const scheduler = new DemandFrameScheduler(30, timestamp => {
      timestamps.push(timestamp);
      if (timestamps.length < 3) scheduler.invalidate();
    }, host);

    scheduler.invalidate();
    host.renderAt(0);
    host.advanceTo(32);
    expect(host.frames.size).toBe(0);
    host.advanceTo(32.34);
    host.renderAt(33.34);
    host.advanceTo(66.34);
    host.renderAt(66.68);

    expect(timestamps).toEqual([0, 0.03334, 0.06668]);
    expect(host.timers.size).toBe(0);
    expect(host.frames.size).toBe(0);
    scheduler.dispose();
  });

  it.each([60, 240])('re-paces a pending frame immediately when the limit changes to %i FPS', fpsLimit => {
    const host = new FakeFrameHost();
    const advance = vi.fn();
    const scheduler = new DemandFrameScheduler(30, () => {
      advance();
      if (advance.mock.calls.length === 1) scheduler.invalidate();
    }, host);
    scheduler.invalidate();
    host.renderAt(0);
    expect(host.timers.size).toBe(1);

    host.advanceTo(20);
    scheduler.setFpsLimit(fpsLimit);
    expect(host.timers.size).toBe(0);
    expect(host.frames.size).toBe(1);
    host.renderAt(16.7);

    expect(advance).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it('retains pending invalidations across hidden tabs and cleans scheduled work on dispose', () => {
    const host = new FakeFrameHost();
    const advance = vi.fn();
    const scheduler = new DemandFrameScheduler(30, advance, host);
    scheduler.invalidate();
    host.renderAt(0);
    scheduler.invalidate();
    host.setVisible(false);
    expect(host.timers.size).toBe(0);
    expect(host.frames.size).toBe(0);

    host.advanceTo(100);
    host.setVisible(true);
    expect(host.frames.size).toBe(1);
    host.renderAt(100);
    expect(advance).toHaveBeenCalledTimes(2);

    scheduler.invalidate();
    scheduler.dispose();
    expect(host.timers.size).toBe(0);
    expect(host.frames.size).toBe(0);
    expect(host.visibilityListeners.size).toBe(0);
  });
});
