import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TILE_LAND_PRESS_DEPTH, TILE_STEP_PRESS_DEPTH } from '../architecture/boardArtSpec';
import { TileMotionController } from './TileMotionController';
import type { TileImpactTiming, TileMotionScheduler } from './tileMotionTypes';

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

function impactTiming(overrides: Partial<TileImpactTiming> = {}): TileImpactTiming {
  return {
    delayMs: 0,
    depressDurationMs: 60,
    reboundDurationMs: 150,
    ...overrides,
  };
}

describe('TileMotionController', () => {
  it('depresses and rebounds a registered tile with one demand-driven loop', () => {
    const clock = fakeScheduler();
    const root = new THREE.Group();
    const controller = new TileMotionController({ scheduler: clock.scheduler });
    controller.register(1, root);

    controller.press(1, 'STEP', impactTiming());
    clock.advance(60);
    expect(root.position.y).toBeLessThan(0);
    expect(controller.getTileOffsetY(1)).toBeCloseTo(-TILE_STEP_PRESS_DEPTH);
    expect(controller.getTilePressIntensity(1)).toBeCloseTo(1);
    expect(controller.getTilePressKind(1)).toBe('STEP');
    clock.advance(150);
    expect(root.position.y).toBeCloseTo(0);
    expect(controller.getTileOffsetY(1)).toBe(0);
    expect(controller.getTilePressIntensity(1)).toBe(0);
    expect(controller.getTilePressKind(1)).toBeNull();
  });

  it('waits for the resolved contact delay without moving or tinting the idle tile', () => {
    const clock = fakeScheduler();
    const root = new THREE.Group();
    const controller = new TileMotionController({ scheduler: clock.scheduler });
    controller.register(1, root);

    controller.press(1, 'STEP', impactTiming({ delayMs: 40 }));
    clock.advance(30);
    expect(root.position.y).toBe(0);
    expect(controller.getTilePressIntensity(1)).toBe(0);
    clock.advance(10);
    clock.advance(30);
    expect(root.position.y).toBeLessThan(0);
    expect(controller.getTilePressIntensity(1)).toBeGreaterThan(0);
  });

  it('restarts the current tile gracefully and animates different tiles independently', () => {
    const clock = fakeScheduler();
    const first = new THREE.Group();
    const second = new THREE.Group();
    const controller = new TileMotionController({ scheduler: clock.scheduler });
    controller.register(1, first);
    controller.register(2, second);

    controller.press(1, 'LAND', impactTiming());
    clock.advance(60);
    controller.press(1, 'STEP', impactTiming());
    controller.press(2, 'STEP', impactTiming());
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
    controller.press(1, 'LAND', impactTiming());
    controller.reset();
    expect(root.position.y).toBe(0);
    expect(controller.getTileOffsetY(1)).toBe(0);

    const reducedRoot = new THREE.Group();
    const reduced = new TileMotionController({ scheduler: clock.scheduler, reducedMotion: true });
    reduced.register(1, reducedRoot);
    reduced.press(1, 'LAND', impactTiming());
    expect(reducedRoot.position.y).toBe(0);
    expect(reduced.getTilePressIntensity(1)).toBe(0);
  });

  it('uses resolved timings instead of owning a global press clock', () => {
    const clock = fakeScheduler();
    const root = new THREE.Group();
    const controller = new TileMotionController({ scheduler: clock.scheduler });
    controller.register(1, root);

    controller.press(1, 'LAND', impactTiming({ depressDurationMs: 24, reboundDurationMs: 36 }));
    clock.advance(24);
    expect(root.position.y).toBeCloseTo(-TILE_LAND_PRESS_DEPTH);
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

    controller.press(1, 'STEP', impactTiming({ depressDurationMs: 100, reboundDurationMs: 100 }));
    clock.advance(40);
    controller.press(2, 'LAND', impactTiming({ depressDurationMs: 20, reboundDurationMs: 20 }));
    clock.advance(20);

    expect(activeRoot.position.y).toBeGreaterThan(-TILE_STEP_PRESS_DEPTH);
    expect(futureRoot.position.y).toBeCloseTo(-TILE_LAND_PRESS_DEPTH);
    clock.advance(80);
    expect(activeRoot.position.y).toBeLessThan(0);
    expect(futureRoot.position.y).toBeCloseTo(0);
  });

  it('consumes a delayed frame across depress and rebound without leaving stale motion', () => {
    const clock = fakeScheduler();
    const root = new THREE.Group();
    const controller = new TileMotionController({ scheduler: clock.scheduler });
    controller.register(1, root);

    controller.press(1, 'LAND', impactTiming({ delayMs: 40 }));
    clock.advance(300);

    expect(root.position.y).toBe(0);
    expect(controller.getTileOffsetY(1)).toBe(0);
    expect(controller.getTilePressIntensity(1)).toBe(0);
  });

  it('keeps LAND physically stronger than STEP without embedding color policy in the controller', () => {
    const clock = fakeScheduler();
    const stepRoot = new THREE.Group();
    const landRoot = new THREE.Group();
    const controller = new TileMotionController({ scheduler: clock.scheduler });
    controller.register(1, stepRoot);
    controller.register(2, landRoot);

    controller.press(1, 'STEP', impactTiming());
    controller.press(2, 'LAND', impactTiming());
    clock.advance(60);

    expect(Math.abs(landRoot.position.y)).toBeGreaterThan(Math.abs(stepRoot.position.y));
    expect(controller.getTilePressKind(1)).toBe('STEP');
    expect(controller.getTilePressKind(2)).toBe('LAND');
  });

  it('drives physical depression from the same normalized press intensity', () => {
    const clock = fakeScheduler();
    const root = new THREE.Group();
    const controller = new TileMotionController({ scheduler: clock.scheduler });
    controller.register(1, root);

    controller.press(1, 'STEP', impactTiming());
    clock.advance(30);

    const intensity = controller.getTilePressIntensity(1);
    expect(root.position.y / -TILE_STEP_PRESS_DEPTH).toBeCloseTo(intensity);
  });

  it('does not notify React subscribers for every high-frequency motion frame', () => {
    const clock = fakeScheduler();
    const root = new THREE.Group();
    const controller = new TileMotionController({ scheduler: clock.scheduler });
    controller.register(1, root);
    let notifications = 0;
    controller.subscribe(() => { notifications += 1; });

    controller.press(1, 'STEP', impactTiming());
    const scheduledNotifications = notifications;
    clock.advance(30);
    expect(notifications).toBe(scheduledNotifications);
    clock.advance(30);
    expect(notifications).toBe(scheduledNotifications);
    clock.advance(150);
    expect(notifications).toBeGreaterThan(scheduledNotifications);
  });
});
