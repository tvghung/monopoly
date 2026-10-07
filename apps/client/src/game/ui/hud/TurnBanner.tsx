import { useContext, useEffect, useRef } from 'react';
import stateContext from '../../../internal';
import PlayerAvatar from '../../../design-system/components/PlayerAvatar/PlayerAvatar';
import { usePresentationSelector } from '../../presentation/usePresentationSelector';
import type { PresentationState } from '../../presentation/store/types';
import { resolveDisplayedPlayer } from './displayedPlayer';
import { useTransientList } from './useTransientList';
import { useTranslation } from '../../../i18n/I18n';

/** Enter, hold and exit at speed 1 (divided by the animation speed): 280 + 900 + 280 ms. */
export const TURN_BANNER_LIFETIME_MS = 280 + 900 + 280;

const selectTurnSlice = (state: PresentationState) => ({
  activePlayerId: state.displayActivePlayerId,
  resetEpoch: state.presentationResetEpoch,
  speed: state.animationSpeedMultiplier,
});
type TurnSlice = ReturnType<typeof selectTurnSlice>;
const sameTurnSlice = (previous: TurnSlice, next: TurnSlice) => previous.activePlayerId === next.activePlayerId
  && previous.resetEpoch === next.resetEpoch
  && previous.speed === next.speed;

interface BannerValue {
  playerId: string;
}

/**
 * Announces a turn change on screen: "Đến lượt bạn!" for the local player, "Lượt của <tên>" otherwise. It shows only
 * when the displayed active player changes during live presentation, never on the first render, after a snap or
 * a reset (a changed presentation reset epoch), and a newer change replaces the banner instead of queueing behind it.
 * It never takes pointer input and is hidden from assistive technology: the roll control's live region announces the
 * turn change once (see `useTurnAnnouncement`) and the status pill shows it.
 */
export default function TurnBanner() {
  const { t } = useTranslation();
  const { state, playerId } = useContext(stateContext);
  const slice = usePresentationSelector(selectTurnSlice, sameTurnSlice);
  const list = useTransientList<BannerValue>(1);
  const lastActive = useRef<string | null | undefined>(undefined);
  const lastEpoch = useRef(slice.resetEpoch);
  const counter = useRef(0);
  const { push, clear } = list;

  useEffect(() => {
    const previous = lastActive.current;
    const epochChanged = lastEpoch.current !== slice.resetEpoch;
    lastActive.current = slice.activePlayerId;
    lastEpoch.current = slice.resetEpoch;
    if (epochChanged) {
      clear();
      return;
    }
    if (previous === undefined || previous === slice.activePlayerId || slice.activePlayerId === null) return;
    counter.current += 1;
    push(`turn-${counter.current}`, { playerId: slice.activePlayerId }, TURN_BANNER_LIFETIME_MS / Math.max(0.1, slice.speed));
  }, [clear, push, slice]);

  const entry = list.entries.at(-1);
  if (!entry) return null;
  const player = resolveDisplayedPlayer(state, entry.value.playerId);
  if (!player) return null;
  const mine = entry.value.playerId === playerId;
  return (
    <div
      className={`turn-banner${mine ? ' turn-banner--mine' : ''}`}
      data-hud-region="turn-banner"
      data-hud-transient="true"
      aria-hidden="true"
      key={entry.key}
    >
      <PlayerAvatar characterId={player.characterId} colorId={player.color} size={48} active={mine} />
      <span className="turn-banner__text">{mine ? t('hud.myTurn') : t('hud.playerTurn', { name: player.name })}</span>
    </div>
  );
}
