import { describe, expect, it } from 'vitest';
import {
  CHARACTER_POKE_DURATION_MS,
  CharacterReactionController,
  getCharacterReactionDuration,
  sampleCharacterReaction,
} from './characterReaction';

describe('character reactions', () => {
  it('starts and completes a deterministic jail reaction', () => {
    const controller = new CharacterReactionController();
    controller.start('jail', 70);

    const active = controller.advance(20);
    expect(active.done).toBe(false);
    expect(active.offsetY).not.toBe(0);

    const complete = controller.advance(50);
    expect(complete.done).toBe(true);
    expect(controller.getState()).toBeNull();
  });

  it('measures reaction progress from its start across a rendering idle gap', () => {
    const controller = new CharacterReactionController();
    controller.start('jail', 70, 3_000);

    expect(controller.advanceAt(3_016).done).toBe(false);
    expect(controller.advanceAt(3_070).done).toBe(true);
    expect(controller.getState()).toBeNull();
  });

  it('uses the resolved reaction duration instead of the base timing', () => {
    const controller = new CharacterReactionController();
    controller.start('jail', getCharacterReactionDuration('jail') / 2);

    expect(controller.advance(getCharacterReactionDuration('jail') / 2).done).toBe(true);
    expect(controller.getState()).toBeNull();
  });

  it('cancels a reaction on reset and does not mutate authoritative data', () => {
    const controller = new CharacterReactionController();
    controller.start('bankrupt');
    controller.reset();

    expect(controller.getState()).toBeNull();
    expect(controller.advance(20).done).toBe(true);
  });

  it('snaps reactions under reduced motion', () => {
    const sample = sampleCharacterReaction('happy', 40, true);

    expect(sample).toMatchObject({
      offsetY: 0,
      rotationZ: 0,
      scaleX: 1,
      scaleY: 1,
      done: true,
    });
  });
});

describe('poke (a mascot answering the pointer)', () => {
  it('hops clearly higher than a game reaction and lands where it took off', () => {
    const peak = Math.max(...Array.from({ length: 41 }, (_, step) => (
      sampleCharacterReaction('poke', (CHARACTER_POKE_DURATION_MS * step) / 40).offsetY
    )));
    const happyPeak = sampleCharacterReaction('happy', getCharacterReactionDuration('happy') / 2).offsetY;
    expect(peak).toBeGreaterThan(happyPeak * 2);
    const end = sampleCharacterReaction('poke', CHARACTER_POKE_DURATION_MS);
    expect(end.done).toBe(true);
    expect(end.offsetY).toBeCloseTo(0, 5);
    expect(end.scaleX).toBeCloseTo(1, 5);
    expect(end.scaleY).toBeCloseTo(1, 5);
  });

  it('crouches before the jump: wider and shorter, still on the ground', () => {
    const crouch = sampleCharacterReaction('poke', CHARACTER_POKE_DURATION_MS * 0.06);
    expect(crouch.offsetY).toBe(0);
    expect(crouch.scaleX).toBeGreaterThan(1);
    expect(crouch.scaleY).toBeLessThan(1);
  });

  it('uses its own duration in the controller and does nothing under reduced motion', () => {
    const controller = new CharacterReactionController();
    controller.start('poke', undefined, 0);
    expect(controller.getState()).toMatchObject({ kind: 'poke', durationMs: CHARACTER_POKE_DURATION_MS });
    expect(controller.advanceAt(CHARACTER_POKE_DURATION_MS / 2).offsetY).toBeGreaterThan(0);
    controller.start('poke', undefined, 0);
    expect(controller.advanceAt(100, true)).toMatchObject({ offsetY: 0, done: true });
    expect(controller.getState()).toBeNull();
  });
});
