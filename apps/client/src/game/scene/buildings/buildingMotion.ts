import * as THREE from 'three';
import { getHotelTransitionProgress } from '../../presentation/buildingSchedule';

/**
 * The frozen Phase 4 pop curves of the buildings (plan 05 §7.2 keeps their timing): a house overshoots to 1.3 and settles, a
 * hotel transition shrinks the four old houses away and pops the hotel in. Pure, so the per-house groups of the legacy
 * layer and the instanced tube houses share one definition.
 */
export function getHousePopScale(progress: number): number {
  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  if (clamped <= 0) return 0;
  if (clamped >= 1) return 1;
  if (clamped < 0.58) {
    const t = clamped / 0.58;
    return 1.3 * (1 - (1 - t) ** 3);
  }
  const t = (clamped - 0.58) / 0.42;
  const eased = t * t * (3 - 2 * t);
  return THREE.MathUtils.lerp(1.3, 1, eased);
}

export interface HotelTransitionScales {
  oldScale: number;
  hotelScale: number;
}

export function getHotelTransitionScales(progress: number): HotelTransitionScales {
  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  const oldProgress = THREE.MathUtils.clamp(clamped / 0.22, 0, 1);
  const oldEased = oldProgress * oldProgress * (3 - 2 * oldProgress);
  const hotelProgress = getHotelTransitionProgress(clamped);
  const hotelScale = hotelProgress < 0.62
    ? 1.25 * (1 - (1 - hotelProgress / 0.62) ** 3)
    : THREE.MathUtils.lerp(
      1.25,
      1,
      ((hotelProgress - 0.62) / 0.38) ** 2
        * (3 - 2 * ((hotelProgress - 0.62) / 0.38)),
    );
  return {
    oldScale: 1 - oldEased,
    hotelScale,
  };
}
