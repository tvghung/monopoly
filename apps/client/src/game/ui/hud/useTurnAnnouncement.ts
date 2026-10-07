import { useState } from 'react';
import type { Language } from '../../../i18n/I18n';
import { translate } from '../../../i18n/I18n';

export function turnAnnouncementText(isMine: boolean, name: string | undefined, language: Language = 'vi'): string {
  if (isMine) return translate('hud.announcementMine', language);
  return name ? translate('hud.announcementOther', language, { name }) : '';
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
  language: Language = 'vi',
): string {
  const [seen, setSeen] = useState<{
    activePlayerId: string | null;
    resetEpoch: number;
    announcement: { isMine: boolean; name?: string } | null;
  }>({ activePlayerId, resetEpoch, announcement: null });
  if (seen.activePlayerId !== activePlayerId || seen.resetEpoch !== resetEpoch) {
    const live = seen.resetEpoch === resetEpoch && seen.activePlayerId !== null && activePlayerId !== null;
    setSeen({
      activePlayerId,
      resetEpoch,
      announcement: live
        ? { isMine: activePlayerId === localPlayerId, ...(activePlayerId !== localPlayerId && activeName ? { name: activeName } : {}) }
        : null,
    });
  }
  return seen.announcement
    ? turnAnnouncementText(seen.announcement.isMine, seen.announcement.name, language)
    : '';
}
