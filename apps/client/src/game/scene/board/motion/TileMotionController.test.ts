import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TileMotionController } from './TileMotionController';
import type { TileMotionScheduler } from './tileMotionTypes';

function fakeScheduler() {
  let now = 0;
  let nextHandle = 0;
  const callbacks = new Map<number, (time: number) => void>();
  const scheduler: TileMotionScheduler = {
    now: () => now,
    requestFrame: callback => {
      nextHandle += 1;
      callbacks.set(nextHandle, callback);
      return nextHandle;
    },
    cancelFrame: handle => callbacks.delete(handle),
  };
  return {
    scheduler,
    advance(milliseconds: number) {
      now += milliseconds;
      const pending = [...callbacks.entries()];
      pending.forEach(([handle, callback]) => {
        callbacks.delete(handle);
        callback(now);
      });
    },
  };
}

describe('TileMotionController', () => {
  it('depresses and rebounds a registered tile with one demand-driven loop', () => {
    const clock = fakeScheduler();
    const root = new THREE.Group();
    const controller = new TileMotionController({ scheduler: clock.scheduler });
    controller.register(1, root);

    controller.press(1, 'STEP', { depressDurationMs: 60, reboundDurationMs: 150 });
    clock.advance(60);
    expect(root.position.y).toBeLessThan(0);
    expect(controller.getTileOffsetY(1)).toBeCloseTo(-0.046);
    expect(controller.getTilePressIntensity(1)).toBeCloseTo(1);
    expect(controller.getTilePressColorMultiplier(1)).toBeCloseTo(0.91);
    clock.advance(150);
    expect(root.position.y).toBeCloseTo(0);
    expect(controller.getTileOffsetY(1)).toBe(0);
    expect(controller.getTilePressIntensity(1)).toBe(0);
    expect(controller.getTilePressColorMultiplier(1)).toBe(1);
  });

  it('restarts the current tile gracefully and animates different tiles independently', () => {
    const clock = fakeScheduler();
    const first = new THREE.Group();
    const second = new THREE.Group();
    const controller = new TileMotionController({ scheduler: clock.scheduler });
    controller.register(1, first);
    controller.register(2, second);

    controller.press(1, 'LAND', { depressDurationMs: 60, reboundDurationMs: 150 });
    clock.advance(60);
    controller.press(1, 'STEP', { depressDurationMs: 60, reboundDurationMs: 150 });
    controller.press(2, 'STEP', { depressDurationMs: 60, reboundDurationMs: 150 });
    clock.advance(60);
    expect(first.position.y).toBeLessThan(0);
    expect(second.position.y).toBeLessThan(0);
    clock.advance(150);
    expect(first.position.y).toBeCloseTo(0);
    expect(second.position.y).toBeCloseTo(0);
  });

  it('reset clears active offsets and reduced motion suppresses the effect', () => {
    const clock = fakeScheduler();
    const root = new THREE.Group();
    const controller = new TileMotionController({ scheduler: clock.scheduler });
    controller.register(1, root);
    controller.press(1, 'LAND', { depressDurationMs: 60, reboundDurationMs: 150 });
    controller.reset();
    expect(root.position.y).toBe(0);
    expect(controller.getTileOffsetY(1)).toBe(0);

    const reducedRoot = new THREE.Group();
    const reduced = new TileMotionController({ scheduler: clock.scheduler, reducedMotion: true });
    reduced.register(1, reducedRoot);
    reduced.press(1, 'LAND', { depressDurationMs: 60, reboundDurationMs: 150 });
    expect(reducedRoot.position.y).toBe(0);
  });

  it('uses resolved timings instead of owning a global press clock', () => {
    const clock = fakeScheduler();
    const root = new THREE.Group();
    const controller = new TileMotionController({ scheduler: clock.scheduler });
    controller.register(1, root);

    controller.press(1, 'LAND', { depressDurationMs: 24, reboundDurationMs: 36 });
    clock.advance(24);
    expect(root.position.y).toBeCloseTo(-0.072);
    clock.advance(36);
    expect(root.position.y).toBe(0);
  });

  it('keeps active timing stable while future impacts use their own resolved timing', () => {
    const clock = fakeScheduler();
    const activeRoot = new THREE.Group();
    const futureRoot = new THREE.Group();
    const controller = new TileMotionController({ scheduler: clock.scheduler });
    controller.register(1, activeRoot);
    controller.register(2, futureRoot);

    controller.press(1, 'STEP', { depressDurationMs: 100, reboundDurationMs: 100 });
    clock.advance(40);
    controller.press(2, 'LAND', { depressDurationMs: 20, reboundDurationMs: 20 });
    clock.advance(20);

    expect(activeRoot.position.y).toBeGreaterThan(-0.046);
    expect(futureRoot.position.y).toBeCloseTo(-0.072);
    clock.advance(80);
    expect(activeRoot.position.y).toBeLessThan(0);
    expect(futureRoot.position.y).toBeCloseTo(0);
  });

  it('consumes a delayed frame across depress and rebound without leaving stale motion', () => {
    const clock = fakeScheduler();
    const root = new THREE.Group();
    const controller = new TileMotionController({ scheduler: clock.scheduler });
    controller.register(1, root);

    controller.press(1, 'LAND', { depressDurationMs: 60, reboundDurationMs: 150 });
    clock.advance(300);

    expect(root.position.y).toBeCloseTo(0);
    expect(controller.getTileOffsetY(1)).toBe(0);
    expect(controller.getTilePressIntensity(1)).toBe(0);
  });

  it('keeps LAND visibly stronger than STEP for depth and darkening', () => {
    const clock = fakeScheduler();
    const stepRoot = new THREE.Group();
    const landRoot = new THREE.Group();
    const controller = new TileMotionController({ scheduler: clock.scheduler });
    controller.register(1, stepRoot);
    controller.register(2, landRoot);

    controller.press(1, 'STEP', { depressDurationMs: 60, reboundDurationMs: 120 });
    controller.press(2, 'LAND', { depressDurationMs: 60, reboundDurationMs: 120 });
    clock.advance(60);

    expect(Math.abs(landRoot.position.y)).toBeGreaterThan(Math.abs(stepRoot.position.y));
    expect(1 - controller.getTilePressColorMultiplier(2)).toBeGreaterThan(
      1 - controller.getTilePressColorMultiplier(1),
    );
  });

  it('drives darkening from the same normalized press intensity as depression', () => {
    const clock = fakeScheduler();
    const root = new THREE.Group();
    const controller = new TileMotionController({ scheduler: clock.scheduler });
    controller.register(1, root);

    controller.press(1, 'STEP', { depressDurationMs: 60, reboundDurationMs: 120 });
    clock.advance(30);

    const intensity = controller.getTilePressIntensity(1);
    expect(root.position.y / -0.046).toBeCloseTo(intensity);
    expect(controller.getTilePressColorMultiplier(1)).toBeCloseTo(1 - intensity * 0.09);
  });
});
