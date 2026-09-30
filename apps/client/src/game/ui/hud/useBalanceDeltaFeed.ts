import { useEffect, useRef } from 'react';
import type { BalanceDeltaSignal } from '../../presentation/store/types';
import { useTransientList, type TransientEntry } from './useTransientList';

/** Each delta chip stays visible this long at speed 1 (divided by the animation speed). */
export const DELTA_CHIP_LIFETIME_MS = 1600;
/** At most this many chips are stacked on one card, newest last. */
export const DELTA_CHIP_LIMIT = 2;

export interface BalanceDeltaFeedOptions {
  resetEpoch: number;
  speed: number;
}

/**
 * The transient "+100.000 ₫" / "-6.000 ₫" chips for one player card. The store keeps up to 64 deltas and never
 * clears them, so the feed remembers the highest sequence it has seen: on mount and on every reset epoch it moves
 * that cursor to the current maximum, which means history is never replayed after a session sync, a reconnect or
 * a replay. Only deltas that arrive afterwards (live presentation) produce chips.
 */
export function useBalanceDeltaFeed(
  playerId: string,
  deltas: readonly BalanceDeltaSignal[],
  { resetEpoch, speed }: BalanceDeltaFeedOptions,
): readonly TransientEntry<BalanceDeltaSignal>[] {
  const list = useTransientList<BalanceDeltaSignal>(DELTA_CHIP_LIMIT);
  const cursorRef = useRef<number | null>(null);
  const epochRef = useRef(resetEpoch);
  const seenRef = useRef(new Set<string>());
  const { push, clear } = list;

  useEffect(() => {
    const highest = deltas.reduce((max, delta) => Math.max(max, delta.sequence), 0);
    // A sequence that went backwards means the store restarted its counter: treat it like a reset.
    const restarted = cursorRef.current !== null && highest < cursorRef.current;
    if (cursorRef.current === null || epochRef.current !== resetEpoch || restarted) {
      cursorRef.current = highest;
      epochRef.current = resetEpoch;
      seenRef.current = new Set(deltas.map(delta => delta.id));
      clear();
      return;
    }
    const cursor = cursorRef.current;
    const fresh = deltas
      .filter(delta => delta.playerId === playerId && delta.sequence > cursor && !seenRef.current.has(delta.id))
      .sort((left, right) => left.sequence - right.sequence || left.consequenceOrder - right.consequenceOrder);
    deltas.forEach(delta => seenRef.current.add(delta.id));
    cursorRef.current = Math.max(cursor, highest);
    const lifetime = DELTA_CHIP_LIFETIME_MS / Math.max(0.1, speed);
    fresh.forEach(delta => push(delta.id, delta, lifetime));
  }, [clear, deltas, playerId, push, resetEpoch, speed]);

  return list.entries;
}
