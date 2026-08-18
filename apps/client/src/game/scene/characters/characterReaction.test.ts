import { describe, expect, it } from 'vitest';
import {
  CharacterReactionController,
  getCharacterReactionDuration,
  sampleCharacterReaction,
} from './characterReaction';

describe('character reactions', () => {
  it('starts and completes a deterministic jail reaction', () => {
    const controller = new CharacterReactionController();
    controller.start('jail');

    const active = controller.advance(20);
    expect(active.done).toBe(false);
    expect(active.offsetY).not.toBe(0);

    const complete = controller.advance(getCharacterReactionDuration('jail'));
    expect(complete.done).toBe(true);
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
