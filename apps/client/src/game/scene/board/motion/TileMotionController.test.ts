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

    controller.press(1, 'STEP');
    clock.advance(60);
    expect(root.position.y).toBeLessThan(0);
    expect(controller.getTileOffsetY(1)).toBeCloseTo(-0.032);
    clock.advance(150);
    expect(root.position.y).toBeCloseTo(0);
    expect(controller.getTileOffsetY(1)).toBe(0);
  });

  it('restarts the current tile gracefully and animates different tiles independently', () => {
    const clock = fakeScheduler();
    const first = new THREE.Group();
    const second = new THREE.Group();
    const controller = new TileMotionController({ scheduler: clock.scheduler });
    controller.register(1, first);
    controller.register(2, second);

    controller.press(1, 'LAND');
    clock.advance(60);
    controller.press(1, 'STEP');
    controller.press(2, 'STEP');
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
    controller.press(1, 'LAND');
    controller.reset();
    expect(root.position.y).toBe(0);
    expect(controller.getTileOffsetY(1)).toBe(0);

    const reducedRoot = new THREE.Group();
    const reduced = new TileMotionController({ scheduler: clock.scheduler, reducedMotion: true });
    reduced.register(1, reducedRoot);
    reduced.press(1, 'LAND');
    expect(reducedRoot.position.y).toBe(0);
  });
});
