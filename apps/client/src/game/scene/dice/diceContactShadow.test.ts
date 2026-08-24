import { describe, expect, it } from 'vitest';
import { DICE_DROP_HEIGHT } from './diceLayout';
import {
  DICE_CONTACT_SHADOW_GROUND_OPACITY,
  DICE_CONTACT_SHADOW_INSTANCE_COUNT,
  DICE_CONTACT_SHADOW_LIFT_OPACITY,
  DICE_CONTACT_SHADOW_MAX_SCALE,
  getDiceContactShadowPosition,
  getDiceContactShadowState,
} from './diceContactShadow';
import { getDiceAnimationVerticalOffset } from './diceOrientation';
import { CENTER_AIRPORT_FIELD_TOP_Y, CONTACT_SHADOW_Y } from '../board/architecture/boardArtSpec';

describe('dice contact-shadow presentation', () => {
  it('uses one ground-locked batch for both visible dice', () => {
    expect(DICE_CONTACT_SHADOW_INSTANCE_COUNT).toBe(2);
    expect(getDiceContactShadowPosition(0)[1]).toBeCloseTo(
      CENTER_AIRPORT_FIELD_TOP_Y + CONTACT_SHADOW_Y,
    );
    expect(getDiceContactShadowPosition(1)[1]).toBeCloseTo(
      CENTER_AIRPORT_FIELD_TOP_Y + CONTACT_SHADOW_Y,
    );
  });

  it('interpolates from a compact dark shadow to a broad faint shadow', () => {
    const grounded = getDiceContactShadowState(0);
    const lifted = getDiceContactShadowState(DICE_DROP_HEIGHT);
    const halfway = getDiceContactShadowState(DICE_DROP_HEIGHT / 2);
    expect(grounded.opacity).toBeCloseTo(DICE_CONTACT_SHADOW_GROUND_OPACITY);
    expect(grounded.scale).toBe(1);
    expect(lifted.opacity).toBeCloseTo(DICE_CONTACT_SHADOW_LIFT_OPACITY);
    expect(lifted.scale).toBeCloseTo(DICE_CONTACT_SHADOW_MAX_SCALE);
    expect(halfway.opacity).toBeGreaterThan(lifted.opacity);
    expect(halfway.opacity).toBeLessThan(grounded.opacity);
    expect(halfway.scale).toBeGreaterThan(1);
    expect(halfway.scale).toBeLessThan(DICE_CONTACT_SHADOW_MAX_SCALE);
  });

  it('uses the same lift and bounce offset at first drop and reroll lift', () => {
    expect(getDiceAnimationVerticalOffset(0, false)).toBeCloseTo(DICE_DROP_HEIGHT);
    expect(getDiceAnimationVerticalOffset(0, true)).toBe(0);
    expect(getDiceAnimationVerticalOffset(0.18, true)).toBeCloseTo(DICE_DROP_HEIGHT);
    expect(getDiceAnimationVerticalOffset(1, true)).toBe(0);
  });
});
