import { useContext, type CSSProperties } from 'react';
import PlayerAvatar from '../../../design-system/components/PlayerAvatar/PlayerAvatar';
import stateContext from '../../../internal';
import { getTileName } from '../formatters';
import { getPlayerDisplayColor } from '../playerVisualColors';
import { isTeamGame, relationBetween, relationLabel, teamOfPlayer } from '../../team/teamView';
import './TileOwnerHoverCard.css';

/**
 * 2v2 only: hovering an owned tile names its real owner with their mascot. Two teammates wear the same ownership colour (the team
 * colour), so the colour alone cannot say who owns a street. Purely presentational and hidden from assistive technology: the
 * tile buttons' accessible names already carry the owner and the team.
 */
export default function TileOwnerHoverCard({ tileId }: { tileId: number | null }) {
  const { state, playerId } = useContext(stateContext);
  if (tileId === null || !isTeamGame(state)) return null;
  const owned = state.boardState.ownedProps[tileId];
  if (!owned) return null;
  const owner = state.players[owned.id] ?? state.boardState.finishedPlayers[owned.id];
  if (!owner) return null;
  const team = teamOfPlayer(state, owned.id);
  const relation = relationLabel(relationBetween(state, playerId, owned.id));
  const style = team
    ? ({ '--hover-team-color': getPlayerDisplayColor(team.color) } as CSSProperties)
    : undefined;

  return (
    <aside
      className="tile-owner-hover"
      data-hud-region="tile-owner-hover"
      data-hud-transient="true"
      data-testid="tile-owner-hover"
      aria-hidden="true"
      style={style}
    >
      <PlayerAvatar characterId={owner.characterId ?? null} colorId={owner.color} size={36} />
      <span className="tile-owner-hover__text">
        <strong className="tile-owner-hover__tile">{getTileName(tileId)}</strong>
        <span className="tile-owner-hover__owner">{`Chủ: ${owner.name}`}</span>
        {team ? <span className="tile-owner-hover__team">{`Đội ${team.name}${relation ? ` · ${relation}` : ''}`}</span> : null}
      </span>
    </aside>
  );
}
