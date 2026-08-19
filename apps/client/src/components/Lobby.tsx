import './style/Lobby.css';
import type {
  CharacterId,
  PlayerColorId,
  SetAppearanceRequest,
} from '@monopoly/shared';
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
}: LobbyProps) {
  const me = players.find(player => player.id === playerId);
  const isHost = hostPlayerId === playerId;
  const takenColors = new Set(
    players.filter(player => player.id !== playerId).map(player => player.color),
  );
  const canStart = isHost
    && players.length >= minPlayers
    && players.length <= maxPlayers
    && players.every(player => player.ready && player.connected && player.characterId !== null)
    && new Set(players.map(player => player.color)).size === players.length;
  const slots = Array.from({ length: maxPlayers }, (_, index) => players[index] ?? null);

  return (
    <section className="lobby" aria-labelledby="lobby-title">
      <article className="lobby__card">
        <header className="lobby__header">
          <div>
            <p className="lobby__brand">OWN THE BLOCK</p>
            <p className="lobby__eyebrow">Mã phòng</p>
            <h1 id="lobby-title" className="lobby__title">{roomCode}</h1>
          </div>
          <div className="lobby__header-actions">
            {onSettings ? <Button variant="ghost" type="button" onClick={onSettings}>Cài đặt</Button> : null}
            <Button className="lobby__leave" variant="secondary" type="button" disabled={busy} onClick={onLeave}>
              Rời phòng
            </Button>
          </div>
        </header>

        <p className="lobby__hint">
          {`Chủ phòng có thể bắt đầu khi ${minPlayers}-${maxPlayers} người chơi đang kết nối đều sẵn sàng và đã chọn mascot.`}
        </p>

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
                <span className="lobby-player__character" aria-label="Nhân vật hiện tại">
                  {player.characterId ? CHARACTER_REGISTRY[player.characterId].displayName : 'Chưa chọn mascot'}
                </span>
                <Badge variant={player.connected ? 'success' : 'neutral'}>
                  {player.connected ? 'Trực tuyến' : 'Mất kết nối'}
                </Badge>
                <Badge variant={player.ready ? 'success' : 'neutral'}>
                  {player.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}
                </Badge>
              </li>
            )
            : (
              <li className="lobby-player lobby-player--empty" key={`empty-${index}`}>
                <span className="lobby-player__disc" aria-hidden="true" />
                <span className="lobby-player__name">Chỗ trống {index + 1}</span>
                <Badge>Đang chờ người chơi</Badge>
              </li>
            ))}
        </ul>

        {me
          ? (
            <MascotPicker
              playerName={me.name}
              selectedCharacterId={me.characterId}
              playerColor={me.color}
              takenColors={takenColors}
              busy={busy}
              onSetAppearance={onSetAppearance}
            />
          )
          : null}

        {error ? <p className="lobby__error" role="alert">{error}</p> : null}

        <div className="lobby__actions">
          <Button
            variant={me?.ready ? 'secondary' : 'primary'}
            className="lobby__button"
            type="button"
            disabled={busy || !me?.connected || me?.characterId === null}
            onClick={() => { if (me) onSetReady(!me.ready); }}
          >
            {me?.characterId === null ? 'Chọn mascot trước' : me?.ready ? 'Hủy sẵn sàng' : 'Sẵn sàng'}
          </Button>

          {isHost
            ? (
              <Button
                className="lobby__button"
                type="button"
                disabled={busy || !canStart}
                onClick={onStart}
              >
                Bắt đầu ván chơi
              </Button>
            )
            : <p className="lobby__waiting-copy">Đang chờ Chủ Phòng bắt đầu...</p>}
        </div>
      </article>
    </section>
  );
}
