import './style/Lobby.css';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { getAppearanceCombinationKey, TEAM_IDS } from '@monopoly/shared';
import type {
  CharacterId,
  GameMode,
  PlayerColorId,
  PublicTeam,
  SetAppearanceRequest,
  TeamId,
} from '@monopoly/shared';
import Button from '../design-system/components/Button/Button';
import Chip from '../design-system/components/Chip/Chip';
import IconButton from '../design-system/components/IconButton/IconButton';
import SegmentedControl from '../design-system/components/SegmentedControl/SegmentedControl';
import { ActionIcon } from '../design-system/icons/ActionIcon';
import HowToPlayButton from '../howToPlay/HowToPlayButton';
import { EmptySeat, LobbySeat } from './lobby/LobbySeat';
import MascotPicker from './lobby/MascotPicker';
import TeamZone from './lobby/TeamZone';
import { useCopyFeedback } from './lobby/copyText';
import { getStartBlockReason } from './lobby/startReadiness';
import type { LobbyPlayerView } from './lobby/lobbyTypes';
import HostLanSharing from './HostLanSharing';

export type { LobbyPlayerView } from './lobby/lobbyTypes';

interface LobbyProps {
  roomCode: string;
  players: LobbyPlayerView[];
  playerId: string;
  hostPlayerId: string | null;
  minPlayers: number;
  maxPlayers: number;
  /** Solo (the free-for-all, default) or 2v2. Chosen by the host; the server owns it. */
  gameMode?: GameMode;
  /** Both teams with their names and colours; only read in 2v2. */
  teams?: readonly PublicTeam[];
  busy: boolean;
  error: string | null;
  onSetReady: (ready: boolean) => void;
  onSetAppearance: (request: SetAppearanceRequest) => void;
  onSetGameMode?: (mode: GameMode) => void;
  onSetTeamName?: (teamId: TeamId, name: string) => void;
  onSetTeamColor?: (color: PlayerColorId) => void;
  onSwapTeams?: (playerId: string, withPlayerId: string) => void;
  onStart: () => void;
  onLeave: () => void;
  onSettings?: () => void;
  showLanSharing?: boolean;
}

const COPY_NOTICES = {
  idle: '',
  copied: 'Đã sao chép.',
  failed: 'Không thể sao chép tự động; hãy chọn mã phòng ở trên.',
} as const;

const MODE_OPTIONS = [
  { value: 'SOLO', label: 'Solo' },
  { value: 'TEAM_2V2', label: '2v2' },
] as const;

export default function Lobby({
  roomCode,
  players,
  playerId,
  hostPlayerId,
  minPlayers,
  maxPlayers,
  gameMode = 'SOLO',
  teams = [],
  busy,
  error,
  onSetReady,
  onSetAppearance,
  onSetGameMode,
  onSetTeamName,
  onSetTeamColor,
  onSwapTeams,
  onStart,
  onLeave,
  onSettings,
  showLanSharing = false,
}: LobbyProps) {
  const startReasonId = useId();
  const swapHintId = useId();
  const codeCopy = useCopyFeedback();
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null);
  const me = players.find(player => player.id === playerId);
  const isHost = hostPlayerId === playerId;
  const teamMode = gameMode === 'TEAM_2V2' && teams.length === TEAM_IDS.length;
  const takenAppearanceKeys = new Set(
    players
      .filter(player => player.id !== playerId && player.characterId !== null)
      .map(player => getAppearanceCombinationKey(player.characterId, player.color))
      .filter((key): key is string => key !== null),
  );
  const startBlockReason = isHost ? getStartBlockReason(players, minPlayers, maxPlayers, gameMode) : null;
  const canStart = isHost && startBlockReason === null;
  const slots = Array.from({ length: maxPlayers }, (_, index) => players[index] ?? null);

  const teamById = useMemo(() => new Map(teams.map(team => [team.teamId, team])), [teams]);
  const myTeam = me && teamMode ? teamById.get(me.teamId) : undefined;
  // 2v2: the mascots a teammate already wears cannot be chosen, because teammates share one colour.
  const lockedCharacterIds = useMemo<ReadonlySet<CharacterId>>(() => new Set(
    teamMode && me
      ? players
        .filter(player => player.id !== me.id && player.teamId === me.teamId && player.characterId !== null)
        .map(player => player.characterId as CharacterId)
      : [],
  ), [me, players, teamMode]);

  const source = players.find(player => player.id === swapSourceId);
  // A swap only makes sense in a 2v2 lobby for the host, and only while the chosen player is still seated.
  useEffect(() => {
    if (swapSourceId !== null && (!teamMode || !isHost || !source)) setSwapSourceId(null);
  }, [isHost, source, swapSourceId, teamMode]);
  useEffect(() => {
    if (swapSourceId === null) return undefined;
    const cancelOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSwapSourceId(null);
    };
    window.addEventListener('keydown', cancelOnEscape);
    return () => window.removeEventListener('keydown', cancelOnEscape);
  }, [swapSourceId]);

  const handleSwapPress = useCallback((pressedId: string) => {
    if (!onSwapTeams) return;
    if (swapSourceId === null) {
      setSwapSourceId(pressedId);
      return;
    }
    if (pressedId === swapSourceId) {
      setSwapSourceId(null);
      return;
    }
    onSwapTeams(swapSourceId, pressedId);
    setSwapSourceId(null);
  }, [onSwapTeams, swapSourceId]);

  const modeControl = onSetGameMode && isHost
    ? (
      <SegmentedControl
        label="Chế độ chơi"
        options={MODE_OPTIONS.map(option => ({ ...option, disabled: busy }))}
        value={gameMode}
        onChange={onSetGameMode}
      />
    )
    : <Chip tone="info">{gameMode === 'TEAM_2V2' ? '2v2' : 'Solo'}</Chip>;

  return (
    <section className="lobby" aria-labelledby="lobby-title">
      <article className="lobby__card">
        <header className="lobby__header">
          <div className="lobby__code">
            <p className="lobby__eyebrow">Mã phòng</p>
            <div className="lobby__code-row">
              <h1 id="lobby-title" className="lobby__title">{roomCode}</h1>
              <IconButton label="Sao chép mã phòng" icon="copy" onClick={() => codeCopy.copy(roomCode)} />
              <span className="lobby__copy-state" role="status">{COPY_NOTICES[codeCopy.state]}</span>
            </div>
          </div>
          <div className="lobby__header-actions">
            <HowToPlayButton variant="labelled" />
            {onSettings ? <Button variant="ghost" icon={<ActionIcon name="settings" />} onClick={onSettings}>Cài đặt</Button> : null}
            <Button className="lobby__leave" variant="secondary" icon={<ActionIcon name="leave" />} disabled={busy} onClick={onLeave}>
              Rời phòng
            </Button>
            {isHost
              ? (
                <div className="lobby__start-group">
                  <Button
                    className="lobby__start"
                    size="lg"
                    icon={<ActionIcon name="start" />}
                    disabled={busy || !canStart}
                    aria-describedby={startBlockReason ? startReasonId : undefined}
                    onClick={onStart}
                  >
                    <span>Bắt đầu</span>
                  </Button>
                  {startBlockReason ? <p className="lobby__start-reason" id={startReasonId}>{startBlockReason}</p> : null}
                </div>
              )
              : null}
          </div>
        </header>

        {onSetGameMode || gameMode === 'TEAM_2V2'
          ? (
            <div className="lobby__mode">
              <p className="lobby__eyebrow">Chế độ chơi</p>
              {modeControl}
              <p className="lobby__mode-hint">
                {gameMode === 'TEAM_2V2'
                  ? 'Hai đội, mỗi đội 2 người: chung màu, mascot khác nhau và cùng nhau thắng.'
                  : 'Mỗi người tự chơi cho mình; người cuối cùng còn lại thắng.'}
              </p>
            </div>
          )
          : null}

        {showLanSharing && isHost ? <HostLanSharing roomCode={roomCode} /> : null}

        {teamMode
          ? (
            <>
              {isHost && source
                ? (
                  <div className="lobby__swap-banner" role="status" id={swapHintId}>
                    <span>
                      {'Chọn người chơi ở đội kia để đổi chỗ với '}
                      <strong>{source.name}</strong>
                      .
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setSwapSourceId(null)}>Hủy</Button>
                  </div>
                )
                : null}
              <div className="lobby__teams" aria-label="Hai đội">
                {TEAM_IDS.map(teamId => {
                  const team = teamById.get(teamId);
                  const other = teamById.get(teamId === 'TEAM_1' ? 'TEAM_2' : 'TEAM_1');
                  if (!team || !other) return null;
                  return (
                    <TeamZone
                      key={teamId}
                      team={team}
                      otherTeamColor={other.color}
                      members={players.filter(player => player.teamId === teamId)}
                      playerId={playerId}
                      hostPlayerId={hostPlayerId}
                      isHost={isHost && Boolean(onSwapTeams)}
                      isOwnTeam={me?.teamId === teamId}
                      busy={busy}
                      swapSourceId={swapSourceId}
                      swapSourceName={source?.name}
                      onSwapPress={handleSwapPress}
                      onSetReady={onSetReady}
                      onSetTeamName={name => onSetTeamName?.(teamId, name)}
                      onSetTeamColor={color => onSetTeamColor?.(color)}
                    />
                  );
                })}
              </div>
            </>
          )
          : (
            <ul className="lobby__players" aria-label="Danh sách người chơi">
              {slots.map((player, index) => player
                ? (
                  <LobbySeat
                    key={player.id}
                    player={player}
                    isSelf={player.id === playerId}
                    isHost={player.id === hostPlayerId}
                    busy={busy}
                    onSetReady={onSetReady}
                  />
                )
                : <EmptySeat key={`empty-${index}`} number={index + 1} />)}
            </ul>
          )}

        {me
          ? (
            <MascotPicker
              selectedCharacterId={me.characterId}
              playerColor={me.color}
              takenAppearanceKeys={takenAppearanceKeys}
              busy={busy}
              onSetAppearance={onSetAppearance}
              showColors={!teamMode}
              teamLabel={myTeam?.name}
              lockedCharacterIds={teamMode ? lockedCharacterIds : undefined}
            />
          )
          : null}

        {error ? <p className="lobby__error" role="alert">{error}</p> : null}
      </article>
    </section>
  );
}
