import { presentationTiming } from './timings';

export interface SequentialHouseBuildStep {
  houseIndex: number;
  delayMs: number;
  durationMs: number;
}

export function getSequentialHouseBuildSteps(
  fromHouses: number,
  toHouses: number,
  totalDurationMs?: number,
): SequentialHouseBuildStep[] {
  const from = Math.max(0, Math.min(4, fromHouses));
  const to = Math.max(from, Math.min(4, toHouses));
  const count = to - from;
  const baseDuration = count > 0
    ? presentationTiming.housePop + (count - 1) * presentationTiming.houseStagger
    : 0;
  const scale = baseDuration > 0 && totalDurationMs !== undefined
    ? Math.max(0, totalDurationMs) / baseDuration
    : 1;
  return Array.from({ length: count }, (_, index) => ({
    houseIndex: from + index,
    delayMs: index * presentationTiming.houseStagger * scale,
    durationMs: presentationTiming.housePop * scale,
  }));
}

export function getHotelAppearanceDelay(totalDurationMs: number): number {
  return Math.max(0, totalDurationMs) * presentationTiming.hotelAppearanceProgress;
}

export function getHotelTransitionProgress(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return Math.min(
    1,
    Math.max(
      0,
      (clamped - presentationTiming.hotelAppearanceProgress)
        / (1 - presentationTiming.hotelAppearanceProgress),
    ),
  );
}
