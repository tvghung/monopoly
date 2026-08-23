import { DICE_DROP_HEIGHT, DICE_SIZE, getDicePosition } from './diceLayout';
import { CONTACT_SHADOW_Y, CENTER_AIRPORT_FIELD_TOP_Y } from '../board/architecture/boardArtSpec';

export const DICE_CONTACT_SHADOW_INSTANCE_COUNT = 2;
export const DICE_CONTACT_SHADOW_GROUND_OPACITY = 0.21;
export const DICE_CONTACT_SHADOW_LIFT_OPACITY = 0.07;
export const DICE_CONTACT_SHADOW_MAX_SCALE = 1.35;
export const DICE_CONTACT_SHADOW_BASE_SCALE: readonly [number, number] = [
  DICE_SIZE * 0.70,
  DICE_SIZE * 0.45,
];

export interface DiceContactShadowState {
  opacity: number;
  scale: number;
  normalizedHeight: number;
}

export function getDiceContactShadowState(verticalOffset: number): DiceContactShadowState {
  const normalizedHeight = Math.min(
    1,
    Math.max(0, verticalOffset) / DICE_DROP_HEIGHT,
  );
  return {
    opacity: DICE_CONTACT_SHADOW_GROUND_OPACITY
      + (DICE_CONTACT_SHADOW_LIFT_OPACITY - DICE_CONTACT_SHADOW_GROUND_OPACITY)
        * normalizedHeight,
    scale: 1 + (DICE_CONTACT_SHADOW_MAX_SCALE - 1) * normalizedHeight,
    normalizedHeight,
  };
}

export function getDiceContactShadowPosition(dieIndex: 0 | 1): readonly [number, number, number] {
  const diePosition = getDicePosition(dieIndex);
  return [
    diePosition[0],
    CENTER_AIRPORT_FIELD_TOP_Y + CONTACT_SHADOW_Y,
    diePosition[2],
  ];
}
