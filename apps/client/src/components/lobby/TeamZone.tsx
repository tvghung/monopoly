import { useId, type CSSProperties } from 'react';
import { TEAM_SIZE, TEAM_SLOTS, type PlayerColorId, type PublicTeam, type TeamSlot } from '@monopoly/shared';
import Badge from '../../design-system/components/Badge/Badge';
import {
  getPlayerAccentDarkColor,
  getPlayerDisplayColor,
  getPlayerDisplayForeground,
} from '../../game/ui/playerVisualColors';
import { EmptySeat, LobbySeat, type SeatSwap } from './LobbySeat';
import TeamColorPicker from './TeamColorPicker';
import TeamNameField from './TeamNameField';
import type { LobbyPlayerView } from './lobbyTypes';
import { useTranslation } from '../../i18n/I18n';

interface TeamZoneProps {
  team: Pick<PublicTeam, 'teamId' | 'name' | 'color'>;
  otherTeamColor: PlayerColorId;
  members: readonly LobbyPlayerView[];
  playerId: string;
  hostPlayerId: string | null;
  /** The viewer is the host: they may remove the other players of this team. */
  isHost: boolean;
  /** The viewer is a member of this team: they may recolour it. */
  isOwnTeam: boolean;
  /** The viewer may rename this team: only a member of it can, the host has no say over the other team's name. */
  canRename: boolean;
  busy: boolean;
  /** The player the viewer has an open swap request with, or null. Read from the room's requests, never kept here. */
  swapTargetId: string | null;
  /** The viewer has a seat and can move or ask for a swap; false takes every swap control away. */
  canSwap: boolean;
  onKick: (playerId: string) => void;
  /** Host only, absent when no bot can be added: puts one bot in this team's empty seat. */
  onAddBot?: (teamSlot: TeamSlot) => void;
  onMoveToSeat: (teamSlot: TeamSlot) => void;
  onRequestSeatSwap: (targetPlayerId: string) => void;
  onCancelSeatSwap: () => void;
  onSetReady: (ready: boolean) => void;
  onSetTeamName: (name: string) => void;
  onSetTeamColor: (color: PlayerColorId) => void;
}

/**
 * The two seat cells of a team, in seat order: a member sits in the cell of their own `teamSlot`, so a lone member in seat 1
 * leaves the first cell empty. A member whose seat is already taken (a lobby the server has not normalised yet) takes the first
 * free cell instead, and anyone beyond two follows the cells; nobody is ever hidden.
 */
export function layoutTeamSeats(members: readonly LobbyPlayerView[]): {
  cells: Array<LobbyPlayerView | null>;
  overflow: LobbyPlayerView[];
} {
  const cells: Array<LobbyPlayerView | null> = TEAM_SLOTS.map(() => null);
  const overflow: LobbyPlayerView[] = [];
  for (const member of members) {
    const own = cells[member.teamSlot] === null ? member.teamSlot : cells.indexOf(null);
    if (own === -1) overflow.push(member);
    else cells[own] = member;
  }
  return { cells, overflow };
}

/**
 * One team of a 2v2 lobby: its name and colour (both editable by its own members only) and its two seats.
 * A team zone is a labelled section with its own list, so a screen reader hears "Đội Rồng, danh sách người chơi" and the seats.
 * Every seat except the viewer's own has a swap control (an empty seat lets the viewer move in at once, an occupied one asks the
 * player to swap), and the host can remove any other player.
 */
export default function TeamZone({
  team, otherTeamColor, members, playerId, hostPlayerId, isHost, isOwnTeam, canRename, busy, swapTargetId, canSwap,
  onKick, onAddBot, onMoveToSeat, onRequestSeatSwap, onCancelSeatSwap, onSetReady, onSetTeamName, onSetTeamColor,
}: TeamZoneProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const style = {
    '--team-color': getPlayerDisplayColor(team.color),
    '--team-color-dark': getPlayerAccentDarkColor(team.color),
    '--team-foreground': getPlayerDisplayForeground(team.color),
  } as CSSProperties;
  const { cells, overflow } = layoutTeamSeats(members);

  const swapFor = (member: LobbyPlayerView): SeatSwap | null => {
    if (!canSwap || member.id === playerId) return null;
    return {
      state: member.id === swapTargetId ? 'PENDING' : 'IDLE',
      onRequest: () => onRequestSeatSwap(member.id),
      onCancel: onCancelSeatSwap,
    };
  };

  const seatOf = (member: LobbyPlayerView, swap: SeatSwap | null) => (
    <LobbySeat
      key={member.id}
      player={member}
      isSelf={member.id === playerId}
      isHost={member.id === hostPlayerId}
      busy={busy}
      onSetReady={onSetReady}
      onKick={isHost && member.id !== playerId ? () => onKick(member.id) : undefined}
      swap={swap}
    />
  );

  return (
      <section className="lobby-team" data-team={team.teamId} style={style} aria-labelledby={headingId}>
      <header className="lobby-team__header">
        <span className="lobby-team__swatch" aria-hidden="true" />
        {canRename
          ? (
            <>
              <h2 id={headingId} className="sr-only">{team.name}</h2>
              <TeamNameField name={team.name} busy={busy} onCommit={onSetTeamName} />
            </>
          )
          : <h2 id={headingId} className="lobby-team__name">{team.name}</h2>}
        <span className="lobby-team__count" aria-label={t('lobby.teamCount', { count: members.length, total: TEAM_SIZE })}>
          {`${members.length}/${TEAM_SIZE}`}
        </span>
        {isOwnTeam ? <Badge variant="info">{t('lobby.yourTeam')}</Badge> : null}
      </header>

      <TeamColorPicker
        teamName={team.name}
        selected={team.color}
        otherTeamColor={otherTeamColor}
        editable={isOwnTeam}
        busy={busy}
        onSelect={onSetTeamColor}
      />

      <ul className="lobby-team__players" aria-label={t('lobby.teamPlayers', { name: team.name })}>
        {cells.map((member, index) => (member
          ? seatOf(member, swapFor(member))
          : (
            <EmptySeat
              key={`empty-${team.teamId}-${index}`}
              number={index + 1}
              teamName={team.name}
              busy={busy}
              onMove={canSwap ? () => onMoveToSeat(TEAM_SLOTS[index]) : undefined}
              onAddBot={onAddBot ? () => onAddBot(TEAM_SLOTS[index]) : undefined}
            />
          )))}
        {overflow.map(member => seatOf(member, null))}
      </ul>
    </section>
  );
}
