import type { DevelopmentChangeSignal } from '../../presentation/store/types';
import { getSequentialHouseBuildSteps, type SequentialHouseBuildStep } from '../../presentation/buildingSchedule';
import type { BoardTileRenderModel } from '../board/boardRenderModel';
import { getHotelTransitionScales, getHousePopScale } from './buildingMotion';
import type { TubeHouseEntry } from './tubeHouseMeshes';

/**
 * The house animations of the instanced tube houses (plan 05 §8.2). The schedule is the frozen Phase 4 one
 * (`buildingSchedule`, `getHousePopScale`, `getHotelTransitionScales`); only the targets changed, from per-house groups to
 * instance matrices. Everything here is pure: the component keeps the clock.
 */
export type HouseAnimation =
  | { kind: 'BUILD'; id: string; tileId: number; durationMs: number; fromHouses: number; toHouses: number; steps: SequentialHouseBuildStep[] }
  | { kind: 'HOTEL'; id: string; tileId: number; durationMs: number };

/**
 * The animations to play for the current render model. Nothing plays with reduced motion, for a downgrade, for a zero
 * duration, or when the change does not lead to the level the tile shows now (the signal is stale).
 */
export function planHouseAnimations(
  tiles: readonly BoardTileRenderModel[],
  changes: ReadonlyMap<number, DevelopmentChangeSignal>,
  reducedMotion: boolean,
): HouseAnimation[] {
  if (reducedMotion) return [];
  const animations: HouseAnimation[] = [];
  for (const tile of tiles) {
    const change = changes.get(tile.tileId);
    if (!change || change.durationMs <= 0 || change.direction === 'DOWN' || change.toHouses !== tile.houses) continue;
    if (change.fromHouses === 4 && change.toHouses === 5) {
      animations.push({ kind: 'HOTEL', id: change.id, tileId: tile.tileId, durationMs: change.durationMs });
      continue;
    }
    const from = Math.max(0, Math.min(4, change.fromHouses));
    const to = Math.max(from, Math.min(4, change.toHouses));
    if (to === from) continue;
    animations.push({
      kind: 'BUILD',
      id: change.id,
      tileId: tile.tileId,
      durationMs: change.durationMs,
      fromHouses: from,
      toHouses: to,
      steps: getSequentialHouseBuildSteps(from, to, change.durationMs),
    });
  }
  return animations;
}

/** Scale of one house at `elapsedMs` of its tile's animation (1 when the tile has none). */
export function getHouseScale(entry: TubeHouseEntry, animation: HouseAnimation | undefined, elapsedMs: number): number {
  if (!animation) return 1;
  if (animation.kind === 'HOTEL') {
    return getHotelTransitionScales(elapsedMs / Math.max(1, animation.durationMs)).oldScale;
  }
  const step = animation.steps.find(candidate => candidate.houseIndex === entry.slot);
  if (!step) return 1;
  const local = elapsedMs - step.delayMs;
  if (local < 0) return 0;
  return getHousePopScale(local / Math.max(1, step.durationMs));
}

/** True while any animation still has time left, so the component keeps asking for frames. */
export function isAnimating(animations: readonly HouseAnimation[], elapsedById: ReadonlyMap<string, number>): boolean {
  return animations.some(animation => (elapsedById.get(animation.id) ?? 0) < animation.durationMs);
}
