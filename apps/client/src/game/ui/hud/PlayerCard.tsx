import type { CSSProperties } from 'react';
import Chip from '../../../design-system/components/Chip/Chip';
import DeltaChip from '../../../design-system/components/DeltaChip/DeltaChip';
import GroupPips from '../../../design-system/components/GroupPips/GroupPips';
import MoneyText from '../../../design-system/components/MoneyText/MoneyText';
import PlayerAvatar, { type PlayerAvatarStatus } from '../../../design-system/components/PlayerAvatar/PlayerAvatar';
import { ActionIcon } from '../../../design-system/icons/ActionIcon';
import type { BalanceDeltaSignal } from '../../presentation/store/types';
import { getPlayerDisplayColor } from '../playerVisualColors';
import type { PlayerCardViewModel } from './playerCardSelectors';
import { describePlayerCard, JAIL_ROUND_LIMIT } from './playerCardText';
import { useAnimatedNumber } from './useAnimatedNumber';
import { useBalanceDeltaFeed } from './useBalanceDeltaFeed';
import { formatCountdown, useCountdownSeconds } from './useCountdown';

export interface PlayerCardProps {
  card: PlayerCardViewModel;
  deltas: readonly BalanceDeltaSignal[];
  reducedMotion: boolean;
  speed: number;
  resetEpoch: number;
  /** The latest chat message of this player, shown for a few seconds while the drawer is closed. */
  bubble?: string;
}

function avatarStatus(card: PlayerCardViewModel): PlayerAvatarStatus {
  if (card.hasLeft) return 'left';
  if (card.isBankrupt) return 'bankrupt';
  if (!card.isConnected) return 'offline';
  return 'online';
}

function cardState(card: PlayerCardViewModel): string {
  if (card.hasLeft) return 'left';
  if (card.isBankrupt) return 'bankrupt';
  if (!card.isConnected) return 'offline';
  if (card.isInJail) return 'jail';
  return 'playing';
}

function RecoveryChip({ deadlineAt }: { deadlineAt: string }) {
  const seconds = useCountdownSeconds(deadlineAt);
  if (seconds === null) return null;
  return (
    <Chip tone="loss" icon={<ActionIcon name="offline" size={14} />}>
      {`Tự bỏ lượt sau ${formatCountdown(seconds)}`}
    </Chip>
  );
}

/**
 * One player's card. The face is decorative (`aria-hidden`): the accessible name of the seat is the visually hidden
 * summary, so a screen reader hears each player once. Money counts to its new value, delta chips show consequences
 * from presentation state, and every status carries text as well as an icon.
 */
export default function PlayerCard({
  card, deltas, reducedMotion, speed, resetEpoch, bubble,
}: PlayerCardProps) {
  const money = useAnimatedNumber(card.displayMoney, { reducedMotion, speed, resetEpoch });
  const chips = useBalanceDeltaFeed(card.playerId, deltas, { resetEpoch, speed });
  const out = card.hasLeft || card.isBankrupt;
  const showJail = card.isInJail && !out;
  const showOffline = !card.isConnected && !out;
  const showTurn = card.isActive && !out;
  const style = { '--player-card-color': getPlayerDisplayColor(card.color) } as CSSProperties;

  return (
    <li
      className={`player-card${showTurn ? ' player-card--active' : ''}${card.isLocal ? ' player-card--local' : ''}`}
      data-player-id={card.playerId}
      data-current-turn={card.isActive}
      data-slot={card.slot ?? undefined}
      data-state={cardState(card)}
      data-hud-region={card.slot ? `player-card-${card.slot.toLowerCase()}` : undefined}
      style={style}
    >
      <span className="sr-only">{describePlayerCard(card)}</span>
      {bubble ? <div className="player-card__bubble" aria-hidden="true">{bubble}</div> : null}
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
            {card.isLocal ? <Chip tone="info" className="player-card__tag">Bạn</Chip> : null}
            {showTurn ? <Chip tone="gold" className="player-card__tag">Đang đi</Chip> : null}
            {showJail ? (
              <Chip tone="loss" className="player-card__tag" icon={<ActionIcon name="jail" size={14} />}>
                {`Ở tù · ${card.jailRoundsElapsed}/${JAIL_ROUND_LIMIT}`}
              </Chip>
            ) : null}
            {showOffline ? (
              <Chip tone="neutral" className="player-card__tag" icon={<ActionIcon name="offline" size={14} />}>
                Mất kết nối
              </Chip>
            ) : null}
            {card.hasLeft ? <Chip tone="neutral" className="player-card__tag">Đã rời</Chip> : null}
          </div>
          <div className="player-card__money-row">
            {card.isBankrupt
              ? <Chip tone="loss" className="player-card__tag" icon={<ActionIcon name="bankrupt" size={14} />}>Phá sản</Chip>
              : <MoneyText amount={money} size="lg" className="player-card__money" />}
            <span className="player-card__chips">
              {chips.map(entry => (
                <DeltaChip key={entry.key} delta={entry.value.delta} reducedMotion={reducedMotion} />
              ))}
            </span>
          </div>
          {showOffline && card.recoveryDeadlineAt ? (
            <div className="player-card__recovery"><RecoveryChip deadlineAt={card.recoveryDeadlineAt} /></div>
          ) : null}
          {!out ? (
            <div className="player-card__footer">
              <GroupPips groups={card.groupPips} className="player-card__pips" />
              <span className="player-card__counts">
                {card.houses > 0 ? <span className="player-card__count"><ActionIcon name="house" size={14} />{card.houses}</span> : null}
                {card.hotels > 0 ? <span className="player-card__count"><ActionIcon name="hotel" size={14} />{card.hotels}</span> : null}
                <span className="player-card__count player-card__count--lots">{card.propertyCount} đất</span>
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
