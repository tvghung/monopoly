import { useEffect, useRef } from 'react';
import type { ActivityEvent } from '@monopoly/shared';
import { useTransientList } from './useTransientList';

/** A bubble stays this long at speed 1 (divided by the animation speed). */
export const CHAT_BUBBLE_LIFETIME_MS = 4000;
export const CHAT_BUBBLE_MAX_CHARS = 80;

/** Collapses whitespace and cuts the message to 80 characters with an ellipsis. Text only, never markup. */
export function truncateBubbleText(message: string): string {
  const flat = message.replace(/\s+/gu, ' ').trim();
  const characters = [...flat];
  return characters.length > CHAT_BUBBLE_MAX_CHARS
    ? `${characters.slice(0, CHAT_BUBBLE_MAX_CHARS - 1).join('').trimEnd()}…`
    : flat;
}

export interface ChatBubbleOptions {
  resetEpoch: number;
  speed: number;
  /** While the drawer is open the messages are already on screen, so no bubbles appear. */
  suppressed: boolean;
}

const MAX_BUBBLES = 4;

/**
 * Speech bubbles for other players' chat: the newest message per sender, kept until its lifetime is over. History is
 * never replayed: the cursor jumps to the newest chat on mount, on every presentation reset epoch and whenever the
 * activity sequence goes backwards. The sender's own messages never bubble.
 */
export function useChatBubbles(
  activity: readonly ActivityEvent[],
  localPlayerId: string | null,
  { resetEpoch, speed, suppressed }: ChatBubbleOptions,
): Readonly<Record<string, string>> {
  const list = useTransientList<string>(MAX_BUBBLES);
  const cursorRef = useRef<number | null>(null);
  const epochRef = useRef(resetEpoch);
  const { push, clear } = list;

  useEffect(() => {
    const newestChat = activity.reduce((latest, event) => (event.type === 'CHAT' ? Math.max(latest, event.sequence) : latest), 0);
    const restarted = cursorRef.current !== null && newestChat < cursorRef.current;
    if (cursorRef.current === null || epochRef.current !== resetEpoch || restarted) {
      cursorRef.current = newestChat;
      epochRef.current = resetEpoch;
      clear();
      return;
    }
    const cursor = cursorRef.current;
    cursorRef.current = Math.max(cursor, newestChat);
    if (suppressed) {
      // The drawer shows the messages now; bubbles that are still up would only repeat them.
      clear();
      return;
    }
    const lifetime = CHAT_BUBBLE_LIFETIME_MS / Math.max(0.1, speed);
    activity
      .filter((event): event is Extract<ActivityEvent, { type: 'CHAT' }> & { senderPlayerId: string } => (
        event.type === 'CHAT'
        && event.sequence > cursor
        && event.senderRole === 'PLAYER'
        && event.senderPlayerId !== undefined
        && event.senderPlayerId !== localPlayerId
      ))
      .sort((left, right) => left.sequence - right.sequence)
      .forEach(event => push(event.senderPlayerId, truncateBubbleText(event.message), lifetime));
  }, [activity, clear, localPlayerId, push, resetEpoch, speed, suppressed]);

  return Object.fromEntries(list.entries.map(entry => [entry.key, entry.value]));
}
