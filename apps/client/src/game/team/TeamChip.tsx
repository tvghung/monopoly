import { useContext, type CSSProperties } from 'react';
import stateContext from '../../internal';
import { getPlayerDisplayColor } from '../ui/playerVisualColors';
import { relationBetween, relationLabel, teamOfPlayer } from './teamView';
import './TeamChip.css';

/**
 * A small "Đội Rồng · Đồng đội" tag beside a player's name wherever players are listed (trade, portfolio). It exists only in a
 * 2v2 game; in Solo it renders nothing. The colour is an accent, the words carry the meaning.
 */
export default function TeamChip({ playerId, className = '' }: { playerId: string; className?: string }) {
  const { state, playerId: viewerId } = useContext(stateContext);
  const team = teamOfPlayer(state, playerId);
  if (!team) return null;
  const relation = relationLabel(relationBetween(state, viewerId ?? null, playerId));
  return (
    <span
      className={`team-chip${className ? ` ${className}` : ''}`}
      data-team={team.teamId}
      style={{ '--team-chip-color': getPlayerDisplayColor(team.color) } as CSSProperties}
    >
      {`Đội ${team.name}${relation ? ` · ${relation}` : ''}`}
    </span>
  );
}
