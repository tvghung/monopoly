import { useEffect, useRef } from 'react';
import { useEffectiveReducedMotion } from '../../../settings/selectors';
import { usePresentationSelector } from '../../presentation/usePresentationSelector';
import type { DevelopmentChangeSignal, PresentationState } from '../../presentation/store/types';
import { getLandmarkVisual } from '../property/landmarkVisuals';
import { useTransientList } from './useTransientList';

/** Enter, hold and exit at speed 1 (divided by the animation speed): the turn banner's curve stretched to 2.2 s. */
export const LANDMARK_BANNER_LIFETIME_MS = 2200;

const selectSlice = (state: PresentationState) => ({
  changes: state.developmentChanges,
  resetEpoch: state.presentationResetEpoch,
  speed: state.animationSpeedMultiplier,
});
type Slice = ReturnType<typeof selectSlice>;
const sameSlice = (previous: Slice, next: Slice) => previous.changes === next.changes
  && previous.resetEpoch === next.resetEpoch
  && previous.speed === next.speed;

/** The change that opens a landmark: a street going up to the hotel tier (in play, always from four houses). */
export function isLandmarkOpening(change: DevelopmentChangeSignal): boolean {
  return change.direction === 'UP' && change.toHouses === 5 && change.fromHouses < 5;
}

/**
 * "Khánh thành <landmark>!" when a street reaches the hotel tier during live presentation (plan 05, decision OD-05-4). It
 * reuses the turn banner's shell, motion and lifetime helper. Like the turn banner it shows only for a development change
 * that really arrives while the player watches, never for what is already on the board when the HUD mounts or after a snap or
 * reset (a changed presentation reset epoch, so reconnects stay silent), and a newer change replaces the banner. Under
 * reduced motion it is the text alone, fading instead of sliding, without the picture. It never takes pointer input and is
 * hidden from assistive technology: the activity log already says that the Khách sạn was built.
 */
export default function LandmarkBanner() {
  const slice = usePresentationSelector(selectSlice, sameSlice);
  const reducedMotion = useEffectiveReducedMotion();
  const list = useTransientList<{ tileId: number }>(1);
  const seen = useRef<ReadonlySet<string> | null>(null);
  const lastEpoch = useRef(slice.resetEpoch);
  const { push, clear } = list;

  useEffect(() => {
    const epochChanged = lastEpoch.current !== slice.resetEpoch;
    lastEpoch.current = slice.resetEpoch;
    const present = new Set(slice.changes.map(change => change.id));
    if (seen.current === null || epochChanged) {
      // The first render and a snap or reset: whatever stands on the board now was not built in front of the player.
      seen.current = present;
      if (epochChanged) clear();
      return;
    }
    for (const change of slice.changes) {
      if (seen.current.has(change.id) || !isLandmarkOpening(change) || !getLandmarkVisual(change.tileId)) continue;
      push(`landmark-${change.id}`, { tileId: change.tileId }, LANDMARK_BANNER_LIFETIME_MS / Math.max(0.1, slice.speed));
    }
    // Signals leave the store after their animation; keeping only the present ids lets the set stay small.
    seen.current = present;
  }, [clear, push, slice]);

  const entry = list.entries.at(-1);
  const visual = entry ? getLandmarkVisual(entry.value.tileId) : undefined;
  if (!entry || !visual) return null;
  return (
    <div
      className="turn-banner landmark-banner"
      data-hud-region="landmark-banner"
      data-hud-transient="true"
      aria-hidden="true"
      key={entry.key}
    >
      {reducedMotion ? null : <img className="landmark-banner__art" src={visual.artUrl} alt="" width={44} height={44} draggable={false} />}
      <span className="turn-banner__text">{`Khánh thành ${visual.landmarkName}!`}</span>
    </div>
  );
}
