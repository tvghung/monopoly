import './style/Lobby.css';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getAppearanceCombinationKey, TEAM_IDS } from '@monopoly/shared';
import type {
  CharacterId,
  GameMode,
  PlayerColorId,
  PublicTeam,
  SeatSwapRequest,
  SetAppearanceRequest,
  TeamId,
  TeamSlot,
} from '@monopoly/shared';
import Button from '../design-system/components/Button/Button';
import Chip from '../design-system/components/Chip/Chip';
import ConfirmationDialog from '../design-system/components/ConfirmationDialog/ConfirmationDialog';
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
import { useToast } from './Toast';
import HostLanSharing from './HostLanSharing';
import { useTranslation } from '../i18n/I18n';

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
  /** The open seat-swap requests of the room (2v2). The Lobby derives every swap state and dialog from these and keeps none itself. */
  seatSwapRequests?: readonly SeatSwapRequest[];
  busy: boolean;
  error: string | null;
  onSetReady: (ready: boolean) => void;
  onSetAppearance: (request: SetAppearanceRequest) => void;
  onSetGameMode?: (mode: GameMode) => void;
  /** Renames the viewer's own team: the server resolves which team that is, so no team is passed. */
  onSetTeamName?: (name: string) => void;
  onSetTeamColor?: (color: PlayerColorId) => void;
  /** Host only: removes another player from the room (asked after a confirmation). */
  onKickPlayer?: (playerId: string) => void;
  /** 2v2: the viewer takes an empty seat at once. */
  onMoveToSeat?: (teamId: TeamId, teamSlot: TeamSlot) => void;
  /** 2v2: the viewer asks the player in an occupied seat to swap places. */
  onRequestSeatSwap?: (targetPlayerId: string) => void;
  /** 2v2: the viewer takes back their open request. */
  onCancelSeatSwap?: () => void;
  /** 2v2: the viewer answers the request another player made to them. */
  onRespondSeatSwap?: (requesterPlayerId: string, accept: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
  onSettings?: () => void;
  showLanSharing?: boolean;
}

const MODE_OPTIONS = [
  { value: 'SOLO', label: 'Solo' },
  { value: 'TEAM_2V2', label: '2v2' },
] as const;

export const SEAT_SWAP_ENDED_NOTICE = 'Yêu cầu đổi chỗ đã kết thúc.';

export default function Lobby({
  roomCode,
  players,
  playerId,
  hostPlayerId,
  minPlayers,
  maxPlayers,
  gameMode = 'SOLO',
  teams = [],
  seatSwapRequests = [],
  busy,
  error,
  onSetReady,
  onSetAppearance,
  onSetGameMode,
  onSetTeamName,
  onSetTeamColor,
  onKickPlayer,
  onMoveToSeat,
  onRequestSeatSwap,
  onCancelSeatSwap,
  onRespondSeatSwap,
  onStart,
  onLeave,
  onSettings,
  showLanSharing = false,
}: LobbyProps) {
  const { language, t } = useTranslation();
  const startReasonId = useId();
  const codeCopy = useCopyFeedback();
  const toast = useToast();
  // Only which seat the host is about to remove while the confirmation is open; a UI question, not room state.
  const [kickTargetId, setKickTargetId] = useState<string | null>(null);
  const me = players.find(player => player.id === playerId);
  const isHost = hostPlayerId === playerId;
  const teamMode = gameMode === 'TEAM_2V2' && teams.length === TEAM_IDS.length;
  const takenAppearanceKeys = new Set(
    players
      .filter(player => player.id !== playerId && player.characterId !== null)
      .map(player => getAppearanceCombinationKey(player.characterId, player.color))
      .filter((key): key is string => key !== null),
  );
  const startBlockReason = isHost ? getStartBlockReason(players, minPlayers, maxPlayers, gameMode, language) : null;
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

  // ---- Host: remove a player (the X on every other seat, asked first) ----
  const canKick = isHost && Boolean(onKickPlayer);
  const kickTarget = canKick ? players.find(player => player.id === kickTargetId && player.id !== playerId) : undefined;
  useEffect(() => {
    // The player left (or was removed) while the question was open: there is nothing to ask about any more.
    if (kickTargetId !== null && !kickTarget) setKickTargetId(null);
  }, [kickTarget, kickTargetId]);

  // ---- 2v2 seat swap: everything below is read from the room's open requests ----
  const canSwap = teamMode && Boolean(me) && Boolean(onMoveToSeat && onRequestSeatSwap && onCancelSeatSwap);
  const outgoingRequest = seatSwapRequests.find(request => request.requesterPlayerId === playerId);
  // The oldest request first: the order of the room's list is the order they were made.
  const incomingRequest = canSwap && onRespondSeatSwap
    ? seatSwapRequests.find(request => request.targetPlayerId === playerId
      && players.some(player => player.id === request.requesterPlayerId))
    : undefined;
  const requester = incomingRequest ? players.find(player => player.id === incomingRequest.requesterPlayerId) : undefined;

  // A request of the viewer's that disappears while their seat stays where it was ended without a swap (declined, or void because
  // the other player moved or left): say so once. Taking it back oneself, a swap that happened and a change of mode say nothing.
  const outgoingTargetId = outgoingRequest?.targetPlayerId ?? null;
  const seatKey = canSwap && me ? `${me.teamId}:${me.teamSlot}` : null;
  const previousRequest = useRef<{ targetId: string | null; seatKey: string | null }>({ targetId: null, seatKey: null });
  const cancelledByViewer = useRef(false);
  useEffect(() => {
    const previous = previousRequest.current;
    previousRequest.current = { targetId: outgoingTargetId, seatKey };
    if (outgoingTargetId !== null) {
      // A request (a new one, or one that replaced another) is open again: a later cancel is a fresh decision.
      if (previous.targetId !== outgoingTargetId) cancelledByViewer.current = false;
      return;
    }
    const ended = previous.targetId !== null && seatKey !== null && previous.seatKey === seatKey;
    if (ended && !cancelledByViewer.current) toast.show(t('lobby.swapEnded'));
    cancelledByViewer.current = false;
  }, [outgoingTargetId, seatKey, t, toast]);

  const cancelSeatSwap = (): void => {
    cancelledByViewer.current = true;
    onCancelSeatSwap?.();
  };

  const modeControl = onSetGameMode && isHost
    ? (
      <SegmentedControl
        label={t('lobby.mode')}
        options={MODE_OPTIONS.map(option => ({ ...option, disabled: busy }))}
        value={gameMode}
        onChange={onSetGameMode}
      />
    )
    : <Chip tone="info">{gameMode === 'TEAM_2V2' ? '2v2' : 'Solo'}</Chip>;

  const requesterTeam = requester ? teamById.get(requester.teamId) : undefined;
  const swapMessage = requester && myTeam && requesterTeam
      ? requester.teamId === me?.teamId
      ? t('lobby.swapSameTeam', { teamName: myTeam.name })
      : t('lobby.swapTeams', { requesterTeam: requesterTeam.name, requesterName: requester.name, myTeam: myTeam.name })
    : '';

  return (
    <section className="lobby" aria-labelledby="lobby-title">
      <article className="lobby__card">
        <header className="lobby__header">
          <div className="lobby__code">
            <p className="lobby__eyebrow">{t('lobby.roomCode')}</p>
            <div className="lobby__code-row">
              <h1 id="lobby-title" className="lobby__title">{roomCode}</h1>
              <IconButton label={t('lobby.copyRoomCode')} icon="copy" onClick={() => codeCopy.copy(roomCode)} />
              <span className="lobby__copy-state" role="status">{codeCopy.state === 'copied' ? t('lobby.copied') : codeCopy.state === 'failed' ? t('lobby.copyFailed') : ''}</span>
            </div>
          </div>
          <div className="lobby__header-actions">
            <HowToPlayButton variant="labelled" />
            {onSettings ? <Button variant="ghost" icon={<ActionIcon name="settings" />} onClick={onSettings}>{t('lobby.settings')}</Button> : null}
            <Button className="lobby__leave" variant="secondary" icon={<ActionIcon name="leave" />} disabled={busy} onClick={onLeave}>
              {t('lobby.leave')}
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
                    <span>{t('lobby.start')}</span>
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
              <p className="lobby__eyebrow">{t('lobby.mode')}</p>
              {modeControl}
              <p className="lobby__mode-hint">
                {gameMode === 'TEAM_2V2'
                  ? t('lobby.modeHint.team')
                  : t('lobby.modeHint.solo')}
              </p>
            </div>
          )
          : null}

        {showLanSharing && isHost ? <HostLanSharing roomCode={roomCode} /> : null}

        {teamMode
          ? (
            <div className="lobby__teams" aria-label={t('lobby.teamsTitle')}>
              {TEAM_IDS.map(teamId => {
                const team = teamById.get(teamId);
                const other = teamById.get(teamId === 'TEAM_1' ? 'TEAM_2' : 'TEAM_1');
                if (!team || !other) return null;
                const ownTeam = me?.teamId === teamId;
                return (
                  <TeamZone
                    key={teamId}
                    team={team}
                    otherTeamColor={other.color}
                    members={players.filter(player => player.teamId === teamId)}
                    playerId={playerId}
                    hostPlayerId={hostPlayerId}
                    isHost={canKick}
                    isOwnTeam={ownTeam}
                    canRename={ownTeam && Boolean(onSetTeamName)}
                    busy={busy}
                    swapTargetId={outgoingTargetId}
                    canSwap={canSwap}
                    onKick={setKickTargetId}
                    onMoveToSeat={teamSlot => onMoveToSeat?.(teamId, teamSlot)}
                    onRequestSeatSwap={targetPlayerId => onRequestSeatSwap?.(targetPlayerId)}
                    onCancelSeatSwap={cancelSeatSwap}
                    onSetReady={onSetReady}
                    onSetTeamName={name => onSetTeamName?.(name)}
                    onSetTeamColor={color => onSetTeamColor?.(color)}
                  />
                );
              })}
            </div>
          )
          : (
            <ul className="lobby__players" aria-label={t('lobby.playerList')}>
              {slots.map((player, index) => player
                ? (
                  <LobbySeat
                    key={player.id}
                    player={player}
                    isSelf={player.id === playerId}
                    isHost={player.id === hostPlayerId}
                    busy={busy}
                    onSetReady={onSetReady}
                    onKick={canKick && player.id !== playerId ? () => setKickTargetId(player.id) : undefined}
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

      <ConfirmationDialog
        open={kickTarget !== undefined}
        title={t('lobby.kickTitle', { name: kickTarget?.name ?? '' })}
        message={t('lobby.kickDetails', { name: kickTarget?.name ?? '' })}
        confirmLabel={t('lobby.kickConfirmLabel')}
        confirmIcon={<ActionIcon name="close" />}
        busy={busy}
        onCancel={() => setKickTargetId(null)}
        onConfirm={() => {
          if (kickTarget) onKickPlayer?.(kickTarget.id);
          setKickTargetId(null);
        }}
      />

      <ConfirmationDialog
        open={requester !== undefined && myTeam !== undefined}
        tone="neutral"
        icon="swap"
        title={t('lobby.swapRequestTitle', { name: requester?.name ?? '' })}
        message={swapMessage}
        confirmLabel={t('lobby.acceptSwap')}
        confirmIcon={<ActionIcon name="accept" />}
        cancelLabel={t('lobby.declineSwap')}
        busy={busy}
        // Escape and "Từ chối" are the same answer; the dialog itself closes when the room no longer holds the request.
        onCancel={() => { if (requester) onRespondSeatSwap?.(requester.id, false); }}
        onConfirm={() => { if (requester) onRespondSeatSwap?.(requester.id, true); }}
      />
    </section>
  );
}
