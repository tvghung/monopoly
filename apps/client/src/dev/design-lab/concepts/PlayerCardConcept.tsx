import type { CharacterId, PlayerColorId } from '@monopoly/shared';
import Chip from '../../../design-system/components/Chip/Chip';
import GroupPips, { type GroupPipsGroup } from '../../../design-system/components/GroupPips/GroupPips';
import MoneyText from '../../../design-system/components/MoneyText/MoneyText';
import PlayerAvatar, { type PlayerAvatarStatus } from '../../../design-system/components/PlayerAvatar/PlayerAvatar';
import { ActionIcon } from '../../../design-system/icons/ActionIcon';

export type PlayerCardConceptState = 'idle' | 'active' | 'jail' | 'offline' | 'bankrupt' | 'left';

export interface PlayerCardConceptProps {
  name: string;
  characterId: CharacterId | null;
  colorId: PlayerColorId;
  money: number;
  state: PlayerCardConceptState;
  isYou?: boolean;
  groups?: readonly GroupPipsGroup[];
  compact?: boolean;
  className?: string;
}

const AVATAR_STATUS: Record<PlayerCardConceptState, PlayerAvatarStatus> = {
  idle: 'online',
  active: 'online',
  jail: 'online',
  offline: 'offline',
  bankrupt: 'bankrupt',
  left: 'left',
};

function StateChip({ state }: { state: PlayerCardConceptState }) {
  switch (state) {
    case 'active':
      return <Chip tone="gold" icon={<ActionIcon name="roll" />}>Đang chơi</Chip>;
    case 'jail':
      return <Chip tone="loss" icon={<ActionIcon name="bail" />}>Trong tù</Chip>;
    case 'offline':
      return <Chip icon={<ActionIcon name="offline" />}>Mất kết nối</Chip>;
    case 'bankrupt':
      return <Chip tone="loss" icon={<ActionIcon name="forfeit" />}>Phá sản</Chip>;
    case 'left':
      return <Chip icon={<ActionIcon name="leave" />}>Đã rời</Chip>;
    default:
      return null;
  }
}

/** Concept-only player card (plan 01 §9.6): the production version is built by plan 03. */
export default function PlayerCardConcept({
  name,
  characterId,
  colorId,
  money,
  state,
  isYou = false,
  groups,
  compact = false,
  className = '',
}: PlayerCardConceptProps) {
  return (
    <article
      className={`lab-card lab-card--${state}${compact ? ' lab-card--compact' : ''}${className ? ` ${className}` : ''}`}
      data-player-state={state}
    >
      <PlayerAvatar
        size={compact ? 40 : 56}
        characterId={characterId}
        colorId={colorId}
        active={state === 'active'}
        status={AVATAR_STATUS[state]}
      />
      <div className="lab-card__body">
        <div className="lab-card__name">
          <span className="lab-card__name-text">{name}</span>
          {isYou ? <Chip tone="info">Bạn</Chip> : null}
        </div>
        <MoneyText amount={money} size="lg" className="lab-card__money" />
        <div className="lab-card__foot">
          {groups ? <GroupPips groups={groups} /> : null}
          <StateChip state={state} />
        </div>
      </div>
    </article>
  );
}
