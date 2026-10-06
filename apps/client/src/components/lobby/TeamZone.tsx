import { useId, type CSSProperties } from 'react';
import { TEAM_SIZE, type PlayerColorId, type PublicTeam } from '@monopoly/shared';
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

interface TeamZoneProps {
  team: Pick<PublicTeam, 'teamId' | 'name' | 'color'>;
  otherTeamColor: PlayerColorId;
  members: readonly LobbyPlayerView[];
  playerId: string;
  hostPlayerId: string | null;
  isHost: boolean;
  /** The viewer is a member of this team: they may recolour it. */
  isOwnTeam: boolean;
  busy: boolean;
  /** The player the host chose to swap, or null while no swap is in progress. */
  swapSourceId: string | null;
  /** The name of that player, so a valid partner's button can say who it swaps with. */
  swapSourceName?: string;
  onSwapPress: (playerId: string) => void;
  onSetReady: (ready: boolean) => void;
  onSetTeamName: (name: string) => void;
  onSetTeamColor: (color: PlayerColorId) => void;
}

/**
 * One team of a 2v2 lobby: its name (editable by the host), its colour (editable by its members) and its seats. A team zone is
 * a labelled section with its own list, so a screen reader hears "Đội Rồng, danh sách người chơi" and the seats inside it.
 */
export default function TeamZone({
  team, otherTeamColor, members, playerId, hostPlayerId, isHost, isOwnTeam, busy,
  swapSourceId, swapSourceName, onSwapPress, onSetReady, onSetTeamName, onSetTeamColor,
}: TeamZoneProps) {
  const headingId = useId();
  const style = {
    '--team-color': getPlayerDisplayColor(team.color),
    '--team-color-dark': getPlayerAccentDarkColor(team.color),
    '--team-foreground': getPlayerDisplayForeground(team.color),
  } as CSSProperties;
  const source = members.find(member => member.id === swapSourceId);

  const swapFor = (member: LobbyPlayerView): SeatSwap | null => {
    if (!isHost) return null;
    if (swapSourceId === null) return { mode: 'IDLE', onPress: () => onSwapPress(member.id) };
    if (member.id === swapSourceId) return { mode: 'SOURCE', onPress: () => onSwapPress(member.id) };
    // The chosen player is on the other team when they are not in this zone: only those seats are valid partners.
    return source
      ? { mode: 'UNAVAILABLE', onPress: () => undefined }
      : { mode: 'TARGET', sourceName: swapSourceName, onPress: () => onSwapPress(member.id) };
  };

  return (
    <section className="lobby-team" data-team={team.teamId} style={style} aria-labelledby={headingId}>
      <header className="lobby-team__header">
        <span className="lobby-team__swatch" aria-hidden="true" />
        {isHost
          ? (
            <>
              <h2 id={headingId} className="sr-only">{team.name}</h2>
              <TeamNameField name={team.name} busy={busy} onCommit={onSetTeamName} />
            </>
          )
          : <h2 id={headingId} className="lobby-team__name">{team.name}</h2>}
        <span className="lobby-team__count" aria-label={`${members.length} trên ${TEAM_SIZE} người`}>
          {`${members.length}/${TEAM_SIZE}`}
        </span>
        {isOwnTeam ? <Badge variant="info">Đội của bạn</Badge> : null}
      </header>

      <TeamColorPicker
        teamName={team.name}
        selected={team.color}
        otherTeamColor={otherTeamColor}
        editable={isOwnTeam}
        busy={busy}
        onSelect={onSetTeamColor}
      />

      <ul className="lobby-team__players" aria-label={`Người chơi của đội ${team.name}`}>
        {members.map(member => (
          <LobbySeat
            key={member.id}
            player={member}
            isSelf={member.id === playerId}
            isHost={member.id === hostPlayerId}
            busy={busy}
            onSetReady={onSetReady}
            swap={swapFor(member)}
          />
        ))}
        {Array.from({ length: Math.max(0, TEAM_SIZE - members.length) }, (_, index) => (
          <EmptySeat key={`empty-${team.teamId}-${index}`} number={members.length + index + 1} />
        ))}
      </ul>
    </section>
  );
}
