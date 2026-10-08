import { useContext } from 'react';
import stateContext from '../../../internal';
import { useTranslation } from '../../../i18n/I18n';

/**
 * Top status: the room code, on wide windows only (`hud.css` hides it below 1280 x 720). It no longer says whose turn it is: the
 * center stage does that once ("Đổ xúc xắc" on your turn, "<tên> đang đi…" otherwise), the active card carries the turn ring, and
 * the roll control's live region announces the change.
 */
export default function StatusPill() {
  const { t } = useTranslation();
  const { roomCode } = useContext(stateContext);
  if (!roomCode) return null;
  return (
    <p className="status-pill" data-hud-region="status-pill">
      <span className="status-pill__room">{t('hud.room', { roomCode })}</span>
    </p>
  );
}
