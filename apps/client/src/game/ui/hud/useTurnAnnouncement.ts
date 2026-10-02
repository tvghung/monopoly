import { useState } from 'react';

export function turnAnnouncementText(isMine: boolean, name: string | undefined): string {
  if (isMine) return 'Đến lượt bạn.';
  return name ? `Lượt của ${name}.` : '';
}

/**
 * The spoken sentence for a turn change, for the roll control's one live region. It is non-empty only after the
 * displayed active player changed during live presentation, and is dropped again on the first render, on any
 * presentation reset epoch change (a snapshot sync) and when the turn is unknown, so nothing is announced on
 * `SESSION_SYNC`, `SPECTATOR_SYNC` or `REPLAY_SYNC`.
 */
export function useTurnAnnouncement(
  activePlayerId: string | null,
  activeName: string | undefined,
  localPlayerId: string | null,
  resetEpoch: number,
): string {
  const [seen, setSeen] = useState({ activePlayerId, resetEpoch, text: '' });
  if (seen.activePlayerId !== activePlayerId || seen.resetEpoch !== resetEpoch) {
    const live = seen.resetEpoch === resetEpoch && seen.activePlayerId !== null && activePlayerId !== null;
    setSeen({
      activePlayerId,
      resetEpoch,
      text: live ? turnAnnouncementText(activePlayerId === localPlayerId, activeName) : '',
    });
  }
  return seen.text;
}
