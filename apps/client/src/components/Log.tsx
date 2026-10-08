import {
  useContext, useMemo, useRef, useEffect, useState, type FormEvent, type KeyboardEvent,
} from 'react';
import type { ActivityEvent } from '@monopoly/shared';
import { MessageCircle, Send } from 'lucide-react';
import './style/Log.css';
import stateContext from '../internal';
import { usePresentationQueue } from '../game/presentation/PresentationProvider';
import { usePresentationSelector } from '../game/presentation/usePresentationSelector';
import type { PresentationState } from '../game/presentation/store/types';
import { activityText } from '../game/ui/hud/activityText';
import { useHudDrawer } from '../game/ui/hud/hudDrawer';
import { useTranslation } from '../i18n/I18n';

const NO_LOGS: readonly string[] = [];

export function getLogActivitySignature(logs: readonly string[]): string {
  return JSON.stringify([logs.length, logs.at(-1) ?? '']);
}

export function getActivitySignature(
  activity: readonly ActivityEvent[],
  logs: readonly string[],
): string {
  const last = activity.at(-1);
  return JSON.stringify([
    activity.length,
    last?.sequence ?? 0,
    last?.eventId ?? '',
    getLogActivitySignature(logs),
  ]);
}

const selectLogSlice = (state: PresentationState) => ({
  displayActivity: state.displayActivity,
  displayLogs: state.displayLogs,
  resetEpoch: state.presentationResetEpoch,
});
type LogSlice = ReturnType<typeof selectLogSlice>;
const sameLogSlice = (previous: LogSlice, next: LogSlice) => previous.displayActivity === next.displayActivity
  && previous.displayLogs === next.displayLogs
  && previous.resetEpoch === next.resetEpoch;

/**
 * Gameplay entries follow the presentation (they wait for the animations that explain them); chat does not. The
 * server commits a chat line at once, so it is taken from the authoritative feed and merged in by sequence.
 */
export function mergeUngatedChat(
  gated: readonly ActivityEvent[],
  authoritative: readonly ActivityEvent[],
): readonly ActivityEvent[] {
  if (gated === authoritative) return gated;
  return [
    ...gated.filter(event => event.type !== 'CHAT'),
    ...authoritative.filter(event => event.type === 'CHAT'),
  ].sort((left, right) => left.sequence - right.sequence);
}

/**
 * The activity log and chat as a drawer on the right edge of the board. It is closed by default and remembers the
 * viewer's choice; a tab with an unread badge stays visible while it is closed. It does not fade: the ticker and the
 * chat bubbles show what is new without the viewer having to open it.
 */
export default function Log() {
  const { language, t } = useTranslation();
  const {
    state, socketFunctions, connected, playerId,
  } = useContext(stateContext);
  const presentation = usePresentationSelector(selectLogSlice, sameLogSlice);
  const hasQueue = usePresentationQueue() !== null;
  const { open: panelOpen, setOpen: setPanelOpen } = useHudDrawer();
  const [chat, setChat] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  // A gameplay line arrived while the drawer was closed. On a phone-sized window most of those lines no longer pop up on the board
  // (see COMPACT_HUD_QUERY), so the tab marks that the Journal has something new; the chat count above stays a number.
  const [newActivity, setNewActivity] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const previousOpenRef = useRef(panelOpen);
  const lastProcessedSequenceRef = useRef<number | null>(null);
  const lastSeenChatSequenceRef = useRef(0);
  const resetEpochRef = useRef(presentation.resetEpoch);
  const authoritativeActivity = state.boardState.activityFeed.events;
  const visibleActivity = useMemo(
    () => (hasQueue ? mergeUngatedChat(presentation.displayActivity, authoritativeActivity) : authoritativeActivity),
    [authoritativeActivity, hasQueue, presentation.displayActivity],
  );
  const narrativeActivity = useMemo(
    () => visibleActivity.filter(event => event.type !== 'DICE_ROLL'),
    [visibleActivity],
  );
  const visibleLogs = hasQueue
    ? presentation.displayLogs
    : visibleActivity.length > 0 ? NO_LOGS : state.boardState.logs;
  const activitySignature = useMemo(
    () => getActivitySignature(visibleActivity, visibleLogs),
    [visibleActivity, visibleLogs],
  );
  const latestActivitySequence = visibleActivity.at(-1)?.sequence ?? 0;
  const latestChatSequence = useMemo(
    () => visibleActivity.reduce((latest, event) => (event.type === 'CHAT' ? Math.max(latest, event.sequence) : latest), 0),
    [visibleActivity],
  );
  const entries = useMemo(
    () => [
      ...visibleLogs.map((entry, index) => <p key={`legacy-${index}`}>{entry}</p>),
      ...narrativeActivity.map(event => (
        <p
          key={event.eventId}
          className={`activity-entry activity-entry--${event.type.toLowerCase()}`}
        >
          {activityText(event, language)}
        </p>
      )),
    ],
    [language, narrativeActivity, visibleLogs],
  );

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activitySignature, panelOpen]);

  // Opening the drawer moves focus into it; closing it (Escape or the tab) leaves focus on the tab.
  useEffect(() => {
    const wasOpen = previousOpenRef.current;
    previousOpenRef.current = panelOpen;
    if (panelOpen && !wasOpen) panelRef.current?.focus();
  }, [panelOpen]);

  useEffect(() => {
    const lastProcessed = lastProcessedSequenceRef.current;
    const reset = resetEpochRef.current !== presentation.resetEpoch
      || (lastProcessed !== null && latestActivitySequence < lastProcessed);
    if (lastProcessed === null || reset) {
      lastProcessedSequenceRef.current = latestActivitySequence;
      lastSeenChatSequenceRef.current = latestChatSequence;
      resetEpochRef.current = presentation.resetEpoch;
      setUnreadCount(0);
      setNewActivity(false);
      return;
    }

    if (latestActivitySequence > lastProcessed) {
      if (!panelOpen) {
        const newUnread = visibleActivity.filter(event => (
          event.type === 'CHAT'
          && event.sequence > lastProcessed
          && event.sequence > lastSeenChatSequenceRef.current
          && (playerId === null || event.senderPlayerId !== playerId)
        )).length;
        if (newUnread > 0) setUnreadCount(count => count + newUnread);
        if (visibleActivity.some(event => event.type !== 'CHAT' && event.sequence > lastProcessed)) setNewActivity(true);
      }
      lastProcessedSequenceRef.current = latestActivitySequence;
    }

    if (panelOpen) {
      lastSeenChatSequenceRef.current = latestChatSequence;
      setUnreadCount(0);
      setNewActivity(false);
    }
  }, [latestActivitySequence, latestChatSequence, panelOpen, playerId, presentation.resetEpoch, visibleActivity]);

  // A half-typed message does not survive closing the drawer: the field is gone and must not send in the dark.
  useEffect(() => {
    if (!panelOpen) setChat('');
  }, [panelOpen]);

  const sendChat = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (chat) socketFunctions.sendChat(chat);
    setChat('');
    e.currentTarget.reset();
  };

  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !panelOpen || event.defaultPrevented) return;
    // A dialog owns Escape while it is open.
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
    event.preventDefault();
    setPanelOpen(false);
    toggleRef.current?.focus();
  };

  return (
    <section
      className={`center__room${panelOpen ? ' center__room--open' : ' center__room--collapsed'}`}
      data-testid="board-log-overlay"
      aria-label={t('log.title')}
      onKeyDown={closeOnEscape}
    >
      <button
        ref={toggleRef}
        className="center__room-toggle"
        data-hud-region="activity-drawer-tab"
        type="button"
        aria-expanded={panelOpen}
        aria-controls="board-log-panel"
        aria-describedby={[unreadCount > 0 ? 'board-log-unread' : '', newActivity ? 'board-log-new' : ''].filter(Boolean).join(' ') || undefined}
        aria-label={t(panelOpen ? 'log.hide' : 'log.show')}
        title={t(panelOpen ? 'log.hide' : 'log.show')}
        onClick={() => setPanelOpen(open => !open)}
      >
        <MessageCircle aria-hidden="true" size={19} strokeWidth={2.25} />
        <span className="center__room-toggle-label" aria-hidden="true">{t('log.shortTitle')}</span>
        {unreadCount > 0
          ? (
            <span
              id="board-log-unread"
              className="center__room-unread"
              aria-label={t('log.unread', { count: unreadCount })}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )
          : null}
        {newActivity
          ? <span id="board-log-new" className="center__room-new" data-testid="log-new-activity">{t('log.newActivity')}</span>
          : null}
      </button>
      {panelOpen
        ? (
          <div
            id="board-log-panel"
            ref={panelRef}
            className="center__room-panel"
            data-hud-region="activity-drawer-panel"
            data-hud-transient="true"
            tabIndex={-1}
          >
            <section ref={scrollRef} className="center__log" role="log" aria-live="polite" aria-label={t('log.gameLog')}>
              {state.loaded
                ? entries
                : <p>{t('board.loading')}</p>}
            </section>
            <section className="center__chat">
              <form className="center__chat--form" onSubmit={sendChat}>
                <input
                  className="center__chat--input"
                  aria-label={t('log.message')}
                  disabled={!connected}
                  onChange={e => setChat(e.target.value)}
                  type="text"
                  name="chat"
                  id="chat"
                  autoComplete="off"
                  placeholder={t('log.messagePlaceholder')}
                />
                <button className="center__chat--button" type="submit" disabled={!connected}>
                  <Send aria-hidden="true" size={16} strokeWidth={2.25} />
                  <span>{t('log.send')}</span>
                </button>
              </form>
            </section>
          </div>
        )
        : null}
    </section>
  );
}
