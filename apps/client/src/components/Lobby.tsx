import './style/Lobby.css';
import { getAppearanceCombinationKey } from '@monopoly/shared';
import type {
  CharacterId,
  PlayerColorId,
  SetAppearanceRequest,
} from '@monopoly/shared';
import {
  Check, LogOut, Play, Settings, X,
} from 'lucide-react';
import Button from '../design-system/components/Button/Button';
import Badge from '../design-system/components/Badge/Badge';
import MascotPicker from './lobby/MascotPicker';
import {
  characterSvgDataUri,
} from '../game/characters/characterSvg';
import { CHARACTER_REGISTRY } from '../game/characters/characterRegistry';
import {
  getPlayerColorLabel,
  getPlayerDisplayColor,
} from '../game/ui/playerVisualColors';
import HostLanSharing from './HostLanSharing';

export interface LobbyPlayerView {
  id: string;
  name: string;
  color: PlayerColorId;
  characterId: CharacterId | null;
  ready: boolean;
  connected: boolean;
}

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
  const me = players.find(player => player.id === playerId);
  const isHost = hostPlayerId === playerId;
  const takenAppearanceKeys = new Set(
    players
      .filter(player => player.id !== playerId && player.characterId !== null)
      .map(player => getAppearanceCombinationKey(player.characterId, player.color))
      .filter((key): key is string => key !== null),
  );
  const appearanceKeys = players
    .map(player => getAppearanceCombinationKey(player.characterId, player.color))
    .filter((key): key is string => key !== null);
  const appearanceCombinationsAreUnique = appearanceKeys.length === players.length
    && new Set(appearanceKeys).size === appearanceKeys.length;
  const canStart = isHost
    && players.length >= minPlayers
    && players.length <= maxPlayers
    && players.every(player => player.ready && player.connected && player.characterId !== null)
    && appearanceCombinationsAreUnique;
  const slots = Array.from({ length: maxPlayers }, (_, index) => players[index] ?? null);

  return (
    <section className="lobby" aria-labelledby="lobby-title">
      <article className="lobby__card">
        <header className="lobby__header">
          <div>
            <p className="lobby__eyebrow">Mã phòng</p>
            <h1 id="lobby-title" className="lobby__title">{roomCode}</h1>
          </div>
          <div className="lobby__header-actions">
            {onSettings ? <Button variant="ghost" icon={<Settings />} type="button" onClick={onSettings}>Cài đặt</Button> : null}
            <Button className="lobby__leave" variant="secondary" icon={<LogOut />} type="button" disabled={busy} onClick={onLeave}>
              Rời phòng
            </Button>
            {isHost
              ? (
                <Button
                  className="lobby__start"
                  icon={<Play />}
                  type="button"
                  disabled={busy || !canStart}
                  onClick={onStart}
                >
                  <span>Bắt đầu</span>
                </Button>
              )
              : null}
          </div>
        </header>

        {showLanSharing && isHost ? <HostLanSharing roomCode={roomCode} /> : null}

        <ul className="lobby__players" aria-label="Danh sách người chơi">
          {slots.map((player, index) => player
            ? (
              <li className="lobby-player lobby-player--occupied" key={player.id}>
                <span
                  className="lobby-player__disc"
                  style={{ backgroundColor: getPlayerDisplayColor(player.color) }}
                  aria-label={`Màu ${getPlayerColorLabel(player.color)}`}
                />
                {player.characterId
                  ? (
                    <img
                      className="lobby-player__mascot"
                      src={characterSvgDataUri(CHARACTER_REGISTRY[player.characterId].svgSource, player.color)}
                      alt=""
                    />
                  )
                  : <span className="lobby-player__mascot lobby-player__mascot--empty" aria-hidden="true">?</span>}
                <span className="lobby-player__name">
                  {player.name}
                  {player.id === playerId ? ' (bạn)' : ''}
                </span>
                {player.id === hostPlayerId ? <Badge variant="warning">Chủ phòng</Badge> : null}
                <span
                  className={`lobby-player__presence-dot ${player.connected
                    ? 'lobby-player__presence-dot--online'
                    : 'lobby-player__presence-dot--offline'}`}
                  aria-label={player.connected ? 'Trực tuyến' : 'Mất kết nối'}
                  title={player.connected ? 'Trực tuyến' : 'Mất kết nối'}
                />
                {player.id === playerId
                  ? (
                    <Button
                      variant={player.ready ? 'secondary' : 'primary'}
                      className="lobby-player__ready-action"
                      icon={player.ready ? <X /> : <Check />}
                      type="button"
                      disabled={busy || !player.connected || player.characterId === null}
                      title={player.characterId === null ? 'Chọn mascot trước để sẵn sàng' : undefined}
                      onClick={() => onSetReady(!player.ready)}
                    >
                      <span>{player.ready ? 'Hủy sẵn sàng' : 'Sẵn sàng'}</span>
                    </Button>
                  )
                  : null}
              </li>
            )
            : (
              <li className="lobby-player lobby-player--empty" key={`empty-${index}`}>
                <span className="lobby-player__disc" aria-hidden="true" />
                <span className="lobby-player__name">Chỗ trống {index + 1}</span>
              </li>
            ))}
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
