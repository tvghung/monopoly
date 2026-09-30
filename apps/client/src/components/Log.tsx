import {
  useContext, useRef, useEffect, useState, type FormEvent, type KeyboardEvent,
} from 'react';
import type { ActivityEvent } from '@monopoly/shared';
import { MessageCircle, Send } from 'lucide-react';
import './style/Log.css';
import stateContext from '../internal';
import { usePresentation } from '../game/presentation/PresentationProvider';
import { activityText } from '../game/ui/hud/activityText';
import { useHudDrawer } from '../game/ui/hud/hudDrawer';

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

/**
 * The activity log and chat as a drawer on the right edge of the board. It is closed by default and remembers the
 * viewer's choice; a tab with an unread badge stays visible while it is closed. It does not fade: the ticker and the
 * chat bubbles show what is new without the viewer having to open it.
 */
export default function Log() {
  const {
    state, socketFunctions, connected, playerId,
  } = useContext(stateContext);
  const { state: presentation, queue } = usePresentation();
  const { open: panelOpen, setOpen: setPanelOpen } = useHudDrawer();
  const [chat, setChat] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const scrollRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const previousOpenRef = useRef(panelOpen);
  const lastProcessedSequenceRef = useRef<number | null>(null);
  const lastSeenChatSequenceRef = useRef(0);
  const resetEpochRef = useRef(presentation.presentationResetEpoch);
  const visibleActivity = queue ? presentation.displayActivity : state.boardState.activityFeed.events;
  const narrativeActivity = visibleActivity.filter(event => event.type !== 'DICE_ROLL');
  const visibleLogs = queue
    ? presentation.displayLogs
    : visibleActivity.length > 0 ? [] : state.boardState.logs;
  const activitySignature = getActivitySignature(visibleActivity, visibleLogs);
  const latestActivitySequence = visibleActivity.at(-1)?.sequence ?? 0;
  const latestChatSequence = visibleActivity.reduce(
    (latest, event) => event.type === 'CHAT' ? Math.max(latest, event.sequence) : latest,
    0,
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
    const reset = resetEpochRef.current !== presentation.presentationResetEpoch
      || (lastProcessed !== null && latestActivitySequence < lastProcessed);
    if (lastProcessed === null || reset) {
      lastProcessedSequenceRef.current = latestActivitySequence;
      lastSeenChatSequenceRef.current = latestChatSequence;
      resetEpochRef.current = presentation.presentationResetEpoch;
      setUnreadCount(0);
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
      }
      lastProcessedSequenceRef.current = latestActivitySequence;
    }

    if (panelOpen) {
      lastSeenChatSequenceRef.current = latestChatSequence;
      setUnreadCount(0);
    }
  }, [latestActivitySequence, latestChatSequence, panelOpen, playerId, presentation.presentationResetEpoch, visibleActivity]);

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
      aria-label="Nhật ký và trò chuyện"
      onKeyDown={closeOnEscape}
    >
      <button
        ref={toggleRef}
        className="center__room-toggle"
        data-hud-region="activity-drawer-tab"
        type="button"
        aria-expanded={panelOpen}
        aria-controls="board-log-panel"
        aria-label={panelOpen ? 'Ẩn nhật ký và trò chuyện' : 'Hiện nhật ký và trò chuyện'}
        title={panelOpen ? 'Ẩn nhật ký và trò chuyện' : 'Hiện nhật ký và trò chuyện'}
        onClick={() => setPanelOpen(open => !open)}
      >
        <MessageCircle aria-hidden="true" size={19} strokeWidth={2.25} />
        <span className="center__room-toggle-label" aria-hidden="true">Nhật ký</span>
        {unreadCount > 0
          ? (
            <span
              className="center__room-unread"
              aria-label={`${unreadCount} tin nhắn chưa đọc`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )
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
            <section ref={scrollRef} className="center__log" role="log" aria-live="polite" aria-label="Nhật ký ván chơi">
              {state.loaded
                ? [
                  ...visibleLogs.map((entry, index) => <p key={`legacy-${index}`}>{entry}</p>),
                  ...narrativeActivity.map(event => (
                    <p
                      key={event.eventId}
                      className={`activity-entry activity-entry--${event.type.toLowerCase()}`}
                    >
                      {activityText(event)}
                    </p>
                  )),
                ]
                : <p>Đang tải…</p>}
            </section>
            <section className="center__chat">
              <form className="center__chat--form" onSubmit={sendChat}>
                <input
                  className="center__chat--input"
                  aria-label="Tin nhắn"
                  disabled={!connected}
                  onChange={e => setChat(e.target.value)}
                  type="text"
                  name="chat"
                  id="chat"
                  autoComplete="off"
                  placeholder="Nhập tin nhắn…"
                />
                <button className="center__chat--button" type="submit" disabled={!connected}>
                  <Send aria-hidden="true" size={16} strokeWidth={2.25} />
                  <span>Gửi</span>
                </button>
              </form>
            </section>
          </div>
        )
        : null}
    </section>
  );
}
