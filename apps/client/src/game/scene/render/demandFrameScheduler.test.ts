import { describe, expect, it, vi } from 'vitest';
import { DemandFrameScheduler, type FrameSchedulerHost } from './demandFrameScheduler';

class FakeFrameHost implements FrameSchedulerHost {
  time = 0;
  visible = true;
  nextId = 1;
  frames = new Map<number, FrameRequestCallback>();
  visibilityListeners = new Set<() => void>();

  now = () => this.time;
  requestAnimationFrame = (callback: FrameRequestCallback) => {
    const id = this.nextId++;
    this.frames.set(id, callback);
    return id;
  };
  cancelAnimationFrame = (id: number) => { this.frames.delete(id); };
  isVisible = () => this.visible;
  onVisibilityChange = (callback: () => void) => {
    this.visibilityListeners.add(callback);
    return () => this.visibilityListeners.delete(callback);
  };

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
    scheduler.dispose();
  });

  it('paces active animation at 30 FPS without changing elapsed time', () => {
    const host = new FakeFrameHost();
    const timestamps: number[] = [];
    const scheduler = new DemandFrameScheduler(30, timestamp => {
      timestamps.push(timestamp);
      if (timestamps.length < 3) scheduler.invalidate();
    }, host);
    scheduler.invalidate();
    for (let tick = 0; tick <= 8; tick += 1) host.renderAt(tick * (1000 / 120));
    expect(timestamps).toEqual([0, 4 / 120, 8 / 120]);
    expect(host.frames.size).toBe(0);
    scheduler.dispose();
  });

  it.each([30, 60, 120, 180, 240].flatMap(cap =>
    [60, 75, 90, 120, 144, 165, 240].map(refreshHz => ({ cap, refreshHz })),
  ))('maintains fractional cadence at $cap FPS on a $refreshHz Hz display', ({ cap, refreshHz }) => {
    const host = new FakeFrameHost();
    const draws: number[] = [];
    const scheduler = new DemandFrameScheduler(cap, timestamp => {
      draws.push(timestamp * 1000);
      scheduler.invalidate();
    }, host);
    scheduler.invalidate();
    for (let tick = 0; tick <= refreshHz * 10; tick += 1) host.renderAt(tick * 1000 / refreshHz);
    const achievedFps = (draws.length - 1) / ((draws.at(-1)! - draws[0]) / 1000);
    expect(achievedFps).toBeGreaterThanOrEqual(Math.min(cap, refreshHz) - 1);
    expect(achievedFps).toBeLessThanOrEqual(Math.min(cap, refreshHz) + 1);
    scheduler.dispose();
  });

  it('re-paces a pending frame when the limit changes', () => {
    const host = new FakeFrameHost();
    const draws: number[] = [];
    const scheduler = new DemandFrameScheduler(30, timestamp => {
      draws.push(timestamp * 1000);
      scheduler.invalidate();
    }, host);
    scheduler.invalidate();
    host.renderAt(0);
    host.renderAt(1000 / 120);
    scheduler.setFpsLimit(120);
    host.renderAt(2 * 1000 / 120);
    expect(draws).toEqual([0, 2 * 1000 / 120]);
    scheduler.dispose();
  });

  it('rebases after a long frame without catching up missed draws', () => {
    const host = new FakeFrameHost();
    const draws: number[] = [];
    const scheduler = new DemandFrameScheduler(60, timestamp => {
      draws.push(timestamp * 1000);
      scheduler.invalidate();
    }, host);
    scheduler.invalidate();
    host.renderAt(0);
    host.renderAt(150);
    host.renderAt(151);
    host.renderAt(166.7);
    expect(draws).toEqual([0, 150, 166.7]);
    scheduler.dispose();
  });

  it.each([30, 60, 120, 240])('keeps a one-second effect duration at %i FPS', cap => {
    const host = new FakeFrameHost();
    let completedAt: number | null = null;
    const scheduler = new DemandFrameScheduler(cap, timestamp => {
      if (timestamp >= 1) completedAt = timestamp * 1000;
      else scheduler.invalidate();
    }, host);
    scheduler.invalidate();
    for (let tick = 0; tick <= 241; tick += 1) host.renderAt(tick * 1000 / 240);
    expect(completedAt).not.toBeNull();
    expect(completedAt!).toBeGreaterThanOrEqual(1000);
    expect(completedAt!).toBeLessThanOrEqual(1000 + 1000 / cap + 1000 / 240);
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
    expect(host.frames.size).toBe(0);

    host.time = 100;
    host.setVisible(true);
    expect(host.frames.size).toBe(1);
    host.renderAt(100);
    expect(advance).toHaveBeenCalledTimes(2);

    scheduler.invalidate();
    scheduler.dispose();
    expect(host.frames.size).toBe(0);
    expect(host.visibilityListeners.size).toBe(0);
  });

  describe('hold (shader warm-up)', () => {
    it('draws nothing while held, keeps the invalidation, and draws the latest state once released', () => {
      const host = new FakeFrameHost();
      const advance = vi.fn();
      const scheduler = new DemandFrameScheduler(60, advance, host);
      const release = scheduler.hold();

      scheduler.invalidate();
      expect(scheduler.isHeld).toBe(true);
      expect(host.frames.size).toBe(0);

      release();
      expect(scheduler.isHeld).toBe(false);
      expect(host.frames.size).toBe(1);
      host.renderAt(10);
      expect(advance).toHaveBeenCalledTimes(1);
      scheduler.dispose();
    });

    it('cancels a frame that was already scheduled when the hold starts', () => {
      const host = new FakeFrameHost();
      const advance = vi.fn();
      const scheduler = new DemandFrameScheduler(60, advance, host);
      scheduler.invalidate();
      expect(host.frames.size).toBe(1);

      const release = scheduler.hold();
      expect(host.frames.size).toBe(0);
      host.renderAt(5);
      expect(advance).not.toHaveBeenCalled();

      release();
      host.renderAt(10);
      expect(advance).toHaveBeenCalledTimes(1);
      scheduler.dispose();
    });

    it('nests, and a release is idempotent', () => {
      const host = new FakeFrameHost();
      const scheduler = new DemandFrameScheduler(60, vi.fn(), host);
      const first = scheduler.hold();
      const second = scheduler.hold();
      scheduler.invalidate();

      first();
      first();
      expect(scheduler.isHeld).toBe(true);
      expect(host.frames.size).toBe(0);

      second();
      expect(scheduler.isHeld).toBe(false);
      expect(host.frames.size).toBe(1);
      scheduler.dispose();
    });

    it('does not start frames when a hidden tab becomes visible while held', () => {
      const host = new FakeFrameHost();
      const scheduler = new DemandFrameScheduler(60, vi.fn(), host);
      scheduler.hold();
      scheduler.invalidate();
      host.setVisible(false);
      host.setVisible(true);
      expect(host.frames.size).toBe(0);
      scheduler.dispose();
    });
  });
});
