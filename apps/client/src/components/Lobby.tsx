import './style/Lobby.css';
import { useId } from 'react';
import { getAppearanceCombinationKey } from '@monopoly/shared';
import type { SetAppearanceRequest } from '@monopoly/shared';
import Button from '../design-system/components/Button/Button';
import IconButton from '../design-system/components/IconButton/IconButton';
import { ActionIcon } from '../design-system/icons/ActionIcon';
import { EmptySeat, LobbySeat } from './lobby/LobbySeat';
import MascotPicker from './lobby/MascotPicker';
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
  busy: boolean;
  error: string | null;
  onSetReady: (ready: boolean) => void;
  onSetAppearance: (request: SetAppearanceRequest) => void;
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

export default function Lobby({
  roomCode,
  players,
  playerId,
  hostPlayerId,
  minPlayers,
  maxPlayers,
  busy,
  error,
  onSetReady,
  onSetAppearance,
  onStart,
  onLeave,
  onSettings,
  showLanSharing = false,
}: LobbyProps) {
  const startReasonId = useId();
  const codeCopy = useCopyFeedback();
  const me = players.find(player => player.id === playerId);
  const isHost = hostPlayerId === playerId;
  const takenAppearanceKeys = new Set(
    players
      .filter(player => player.id !== playerId && player.characterId !== null)
      .map(player => getAppearanceCombinationKey(player.characterId, player.color))
      .filter((key): key is string => key !== null),
  );
  const startBlockReason = isHost ? getStartBlockReason(players, minPlayers, maxPlayers) : null;
  const canStart = isHost && startBlockReason === null;
  const slots = Array.from({ length: maxPlayers }, (_, index) => players[index] ?? null);

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

        {showLanSharing && isHost ? <HostLanSharing roomCode={roomCode} /> : null}

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

        {me
          ? (
            <MascotPicker
              selectedCharacterId={me.characterId}
              playerColor={me.color}
              takenAppearanceKeys={takenAppearanceKeys}
              busy={busy}
              onSetAppearance={onSetAppearance}
            />
          )
          : null}

        {error ? <p className="lobby__error" role="alert">{error}</p> : null}
      </article>
    </section>
  );
}
