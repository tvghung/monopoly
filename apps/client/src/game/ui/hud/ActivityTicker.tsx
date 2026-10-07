import { useEffect, useRef } from 'react';
import type { ActivityEvent } from '@monopoly/shared';
import { usePresentationSelector } from '../../presentation/usePresentationSelector';
import type { PresentationState } from '../../presentation/store/types';
import { activityText } from './activityText';
import { useHudDrawer } from './hudDrawer';
import { useTransientList } from './useTransientList';
import { useTranslation } from '../../../i18n/I18n';

/** The line stays this long at speed 1 (divided by the animation speed). */
export const ACTIVITY_TICKER_LIFETIME_MS = 4000;

const selectTickerSlice = (state: PresentationState) => ({
  activity: state.displayActivity,
  resetEpoch: state.presentationResetEpoch,
  speed: state.animationSpeedMultiplier,
});
type TickerSlice = ReturnType<typeof selectTickerSlice>;
const sameTickerSlice = (previous: TickerSlice, next: TickerSlice) => previous.activity === next.activity
  && previous.resetEpoch === next.resetEpoch
  && previous.speed === next.speed;

/** Chat has its own bubbles and the dice result has its own callout. */
const isTickerEvent = (event: ActivityEvent): boolean => event.type !== 'CHAT' && event.type !== 'DICE_ROLL';

/**
 * One line with the newest gameplay event, for a few seconds. It is hidden while the drawer is open (the same text is
 * already on screen there), a click opens the drawer, and it never replays history: the cursor jumps to the newest event
 * on mount, on every presentation reset epoch and when the sequence goes backwards. Text only, hidden from assistive
 * technology because the drawer's log region is the accessible history.
 */
export default function ActivityTicker() {
  const { language } = useTranslation();
  const slice = usePresentationSelector(selectTickerSlice, sameTickerSlice);
  const drawer = useHudDrawer();
  const list = useTransientList<ActivityEvent>(1);
  const cursorRef = useRef<number | null>(null);
  const epochRef = useRef(slice.resetEpoch);
  const { push, clear } = list;

  useEffect(() => {
    const newest = slice.activity.reduce((latest, event) => Math.max(latest, event.sequence), 0);
    const restarted = cursorRef.current !== null && newest < cursorRef.current;
    if (cursorRef.current === null || epochRef.current !== slice.resetEpoch || restarted) {
      cursorRef.current = newest;
      epochRef.current = slice.resetEpoch;
      clear();
      return;
    }
    const cursor = cursorRef.current;
    cursorRef.current = Math.max(cursor, newest);
    const latestGameplay = slice.activity.filter(event => event.sequence > cursor && isTickerEvent(event)).at(-1);
    if (latestGameplay) {
      push(latestGameplay.eventId, latestGameplay, ACTIVITY_TICKER_LIFETIME_MS / Math.max(0.1, slice.speed));
    }
  }, [clear, push, slice]);

  const entry = list.entries.at(-1);
  if (!entry || drawer.open) return null;
  return (
    <div
      key={entry.key}
      className="activity-ticker"
      data-hud-region="activity-ticker"
      data-hud-transient="true"
      aria-hidden="true"
      onClick={() => drawer.setOpen(true)}
    >
      {activityText(entry.value, language)}
    </div>
  );
}
