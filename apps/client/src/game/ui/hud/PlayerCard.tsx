import { useState, type CSSProperties } from 'react';
import Chip from '../../../design-system/components/Chip/Chip';
import DeltaChip from '../../../design-system/components/DeltaChip/DeltaChip';
import GroupPips from '../../../design-system/components/GroupPips/GroupPips';
import MoneyText from '../../../design-system/components/MoneyText/MoneyText';
import PlayerAvatar, { type PlayerAvatarStatus } from '../../../design-system/components/PlayerAvatar/PlayerAvatar';
import { ActionIcon } from '../../../design-system/icons/ActionIcon';
import type { BalanceDeltaSignal } from '../../presentation/store/types';
import { relationLabel, reviveTurnsLabel } from '../../team/teamView';
import { getPlayerDisplayColor, getPlayerDisplayForeground } from '../playerVisualColors';
import type { PlayerCardViewModel } from './playerCardSelectors';
import { describePlayerCard, JAIL_ROUND_LIMIT } from './playerCardText';
import { useAnimatedNumber } from './useAnimatedNumber';
import { useBalanceDeltaFeed } from './useBalanceDeltaFeed';
import { formatCountdown, useCountdownSeconds } from './useCountdown';
import { useTranslation } from '../../../i18n/I18n';

export interface PlayerCardProps {
  card: PlayerCardViewModel;
  deltas: readonly BalanceDeltaSignal[];
  reducedMotion: boolean;
  speed: number;
  resetEpoch: number;
  /** The latest chat message of this player, shown for a few seconds while the drawer is closed. */
  bubble?: string;
  /** Opens this player's portfolio; without it the card is a plain display. */
  onSelect?: (playerId: string) => void;
}

/** Status tags that fit next to the name; the rest stay in the screen-reader summary. Highest priority first. */
const MAX_STATUS_TAGS = 2;

function avatarStatus(card: PlayerCardViewModel): PlayerAvatarStatus {
  if (card.hasLeft) return 'left';
  if (card.isBankrupt) return 'bankrupt';
  if (!card.isConnected) return 'offline';
  return 'online';
}

function cardState(card: PlayerCardViewModel): string {
  if (card.hasLeft) return 'left';
  if (card.isBankrupt) return card.revive?.kind === 'REVIVABLE' ? 'revivable' : 'bankrupt';
  if (!card.isConnected) return 'offline';
  if (card.isInJail) return 'jail';
  return 'playing';
}

/**
 * True only for the render in which this card became the active one during live presentation. A card that is already
 * active on mount, or becomes active together with a snapshot sync (a changed reset epoch), does not pulse.
 */
function useTurnPulse(active: boolean, resetEpoch: number): boolean {
  const [seen, setSeen] = useState({ active, resetEpoch, pulse: false });
  if (seen.active !== active || seen.resetEpoch !== resetEpoch) {
    setSeen({ active, resetEpoch, pulse: active && !seen.active && seen.resetEpoch === resetEpoch });
  }
  return seen.pulse;
}

/**
 * One player's card. The face is decorative (`aria-hidden`): the accessible name of the seat is the visually hidden
 * summary, so a screen reader hears each player once. Money counts to its new value, delta chips show consequences
 * from presentation state, and every status carries text as well as an icon. A real button over the face, outside the
 * hidden subtree so it stays reachable, opens the player's portfolio.
 */
export default function PlayerCard({
  card, deltas, reducedMotion, speed, resetEpoch, bubble, onSelect,
}: PlayerCardProps) {
  const { language, t } = useTranslation();
  const money = useAnimatedNumber(card.displayMoney, { reducedMotion, speed, resetEpoch });
  const chips = useBalanceDeltaFeed(card.playerId, deltas, { resetEpoch, speed });
  const out = card.hasLeft || card.isBankrupt;
  const showJail = card.isInJail && !out;
  const showOffline = !card.isConnected && !out;
  const showTurn = card.isActive && !out;
  const pulse = useTurnPulse(showTurn, resetEpoch);
  const recoverySeconds = useCountdownSeconds(showOffline ? card.recoveryDeadlineAt : null);
  const style = {
    '--player-card-color': getPlayerDisplayColor(card.color),
    ...(card.teamColor
      ? {
        '--player-card-team-color': getPlayerDisplayColor(card.teamColor),
        '--player-card-team-foreground': getPlayerDisplayForeground(card.teamColor),
      }
      : {}),
  } as CSSProperties;
  const relation = relationLabel(card.relation, language);
  const tags = [
    { id: 'offline', show: showOffline },
    { id: 'jail', show: showJail },
    { id: 'turn', show: showTurn },
    { id: 'local', show: card.isLocal },
  ].filter(tag => tag.show).slice(0, MAX_STATUS_TAGS).map(tag => tag.id);

  return (
    <li
      className={`player-card${showTurn ? ' player-card--active' : ''}${pulse ? ' player-card--pulse' : ''}${card.isLocal ? ' player-card--local' : ''}${recoverySeconds !== null ? ' player-card--recovering' : ''}`}
      data-player-id={card.playerId}
      data-current-turn={card.isActive}
      data-slot={card.slot ?? undefined}
      data-state={cardState(card)}
      data-team={card.teamId ?? undefined}
      data-relation={card.relation?.toLowerCase() ?? undefined}
      data-hud-region={card.slot ? `player-card-${card.slot.toLowerCase()}` : undefined}
      style={style}
    >
      <span className="sr-only">{describePlayerCard(card, language)}</span>
      {bubble ? <div className="player-card__bubble" data-hud-region="chat-bubble" data-hud-transient="true" aria-hidden="true">{bubble}</div> : null}
      {onSelect && card.slot ? (
        <button
          type="button"
          className="player-card__open"
          aria-label={t('playerCard.viewAssets', { name: card.name })}
          onClick={() => onSelect(card.playerId)}
        />
      ) : null}
      {card.teamName ? (
        <span className="player-card__team" aria-hidden="true" title={relation ? t('team.name', { name: card.teamName }) + ' · ' + relation : t('team.name', { name: card.teamName })}>
          <span className="player-card__team-name">{t('team.name', { name: card.teamName })}</span>
          {relation && card.relation !== 'SELF' ? <span className="player-card__team-relation">{relation}</span> : null}
        </span>
      ) : null}
      <div className="player-card__face" aria-hidden="true">
        <PlayerAvatar
          characterId={card.characterId}
          colorId={card.color}
          size={56}
          active={showTurn}
          status={avatarStatus(card)}
          className="player-card__avatar"
        />
        <div className="player-card__body">
          <div className="player-card__name-row">
            <span className="player-card__name" title={card.name}>{card.name}</span>
            {tags.includes('local') ? <Chip tone="info" className="player-card__tag player-card__tag--text">{t('status.you')}</Chip> : null}
            {tags.includes('turn') ? <Chip tone="gold" className="player-card__tag player-card__tag--text">{t('status.turn')}</Chip> : null}
            {tags.includes('jail') ? (
              <Chip tone="loss" className="player-card__tag" icon={<ActionIcon name="jail" size={14} />}>
                <span className="player-card__tag-text">{t('status.jailRounds', { elapsed: card.jailRoundsElapsed, limit: JAIL_ROUND_LIMIT })}</span>
              </Chip>
            ) : null}
            {tags.includes('offline') ? (
              <Chip tone="neutral" className="player-card__tag player-card__tag--offline" icon={<ActionIcon name="offline" size={14} />}>
                <span className="player-card__tag-text">{t('status.disconnected')}</span>
                {recoverySeconds !== null
                  ? <span className="player-card__tag-countdown">{formatCountdown(recoverySeconds)}</span>
                  : null}
              </Chip>
            ) : null}
          {card.hasLeft ? <Chip tone="neutral" className="player-card__tag player-card__tag--text">{t('status.left')}</Chip> : null}
          </div>
          <div className="player-card__money-row">
            {card.isBankrupt
              ? <Chip tone="loss" className="player-card__tag" icon={<ActionIcon name="bankrupt" size={14} />}>{t('status.bankrupt')}</Chip>
              : <MoneyText amount={money} size="lg" className="player-card__money" />}
            {card.isBankrupt && card.revive?.kind === 'REVIVABLE'
              ? (
                <>
                  <Chip tone="gold" className="player-card__tag player-card__tag--revive">{t('team.revivable')}</Chip>
                  <Chip tone={card.revive.window.turnsRemaining <= 1 ? 'loss' : 'info'} className="player-card__tag player-card__tag--revive-turns">{reviveTurnsLabel(card.revive.window.turnsRemaining, language)}</Chip>
                </>
              )
              : null}
            {card.isBankrupt && card.revive?.kind === 'PERMANENT'
              ? <Chip tone="neutral" className="player-card__tag player-card__tag--permanent">{t('team.permanent')}</Chip>
              : null}
            <span className="player-card__chips">
              {chips.map(entry => (
                <DeltaChip key={entry.key} delta={entry.value.delta} reducedMotion={reducedMotion} />
              ))}
            </span>
          </div>
          {recoverySeconds !== null ? (
            <div className="player-card__recovery">
              <Chip tone="loss" icon={<ActionIcon name="offline" size={14} />}>
                {t('playerCard.recovery', { time: formatCountdown(recoverySeconds) })}
              </Chip>
            </div>
          ) : null}
          {!out ? (
            <div className="player-card__footer">
              <GroupPips groups={card.groupPips} className="player-card__pips" />
              <span className="player-card__counts">
                {card.houses > 0 ? <span className="player-card__count"><ActionIcon name="house" size={14} />{card.houses}</span> : null}
                {card.hotels > 0 ? <span className="player-card__count"><ActionIcon name="hotel" size={14} />{card.hotels}</span> : null}
                <span className="player-card__count player-card__count--lots">{t('playerCard.assetCount', { count: card.propertyCount })}</span>
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
