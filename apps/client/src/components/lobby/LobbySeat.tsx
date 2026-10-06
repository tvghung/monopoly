import { useId, type CSSProperties } from 'react';
import Badge from '../../design-system/components/Badge/Badge';
import Button from '../../design-system/components/Button/Button';
import IconButton from '../../design-system/components/IconButton/IconButton';
import { ActionIcon } from '../../design-system/icons/ActionIcon';
import { CHARACTER_REGISTRY } from '../../game/characters/characterRegistry';
import { characterSvgDataUri } from '../../game/characters/characterSvg';
import {
  getPlayerAccentDarkColor,
  getPlayerColorLabel,
  getPlayerDisplayColor,
} from '../../game/ui/playerVisualColors';
import type { LobbyPlayerView } from './lobbyTypes';

/**
 * The host's team-swap flow as one seat sees it. `IDLE`: the host may start a swap from this seat. `SOURCE`: this is the player the
 * host chose (pressing again cancels). `TARGET`: a valid partner, highlighted. `UNAVAILABLE`: a swap is in progress and this seat
 * cannot be its partner (same team as the chosen player).
 */
export type SeatSwapMode = 'IDLE' | 'SOURCE' | 'TARGET' | 'UNAVAILABLE';

export interface SeatSwap {
  mode: SeatSwapMode;
  /** The name of the chosen player, for the label of a TARGET seat. */
  sourceName?: string;
  onPress: () => void;
}

interface LobbySeatProps {
  player: LobbyPlayerView;
  /** The viewer's own seat: the only one with a ready button. */
  isSelf: boolean;
  isHost: boolean;
  busy: boolean;
  onSetReady: (ready: boolean) => void;
  /** 2v2, host only: the explicit swap control of this seat. */
  swap?: SeatSwap | null;
}

const NO_MASCOT_HINT = 'Chọn mascot trước để sẵn sàng';

/** One seated player: the mascot on a pedestal in the player color, name, ready stamp and presence. No mascot name is shown. */
export function LobbySeat({
  player, isSelf, isHost, busy, onSetReady, swap = null,
}: LobbySeatProps) {
  const hintId = useId();
  const needsMascot = player.characterId === null;
  const seatStyle = {
    '--seat-color': getPlayerDisplayColor(player.color),
    '--seat-color-dark': getPlayerAccentDarkColor(player.color),
  } as CSSProperties;
  const readyLabel = player.ready ? 'Đã sẵn sàng' : 'Chưa sẵn sàng';
  const className = [
    'lobby-player',
    'lobby-player--occupied',
    player.connected ? '' : 'lobby-player--disconnected',
    isSelf ? 'lobby-player--self' : '',
    swap?.mode === 'SOURCE' ? 'lobby-player--swap-source' : '',
    swap?.mode === 'TARGET' ? 'lobby-player--swap-target' : '',
  ].filter(Boolean).join(' ');

  return (
    <li className={className} style={seatStyle} data-team={player.teamId} data-player-id={player.id}>
      {swap && swap.mode !== 'UNAVAILABLE'
        ? (
          <div className="lobby-player__swap">
            {swap.mode === 'TARGET'
              ? (
                <Button
                  size="sm"
                  className="lobby-player__swap-target"
                  icon={<ActionIcon name="swap" />}
                  disabled={busy}
                  aria-label={`Đổi chỗ ${player.name} với ${swap.sourceName ?? 'người đã chọn'}`}
                  onClick={swap.onPress}
                >
                  Đổi chỗ
                </Button>
              )
              : (
                <IconButton
                  label={swap.mode === 'SOURCE' ? `Hủy đổi đội của ${player.name}` : `Đổi đội của ${player.name}`}
                  icon="swap"
                  pressed={swap.mode === 'SOURCE'}
                  disabled={busy}
                  onClick={swap.onPress}
                />
              )}
          </div>
        )
        : null}
      <div className="lobby-player__stage">
        <span className="lobby-player__disc" role="img" aria-label={`Màu ${getPlayerColorLabel(player.color)}`} />
        {player.characterId
          ? (
            <img
              className="lobby-player__mascot"
              src={characterSvgDataUri(CHARACTER_REGISTRY[player.characterId].svgSource, player.color)}
              alt=""
              draggable={false}
            />
          )
          : <span className="lobby-player__mascot lobby-player__mascot--empty" aria-hidden="true">?</span>}
      </div>
      <div className="lobby-player__identity">
        <span className="lobby-player__name">
          {player.name}
          {isSelf ? ' (bạn)' : ''}
        </span>
        {isHost ? <Badge variant="warning">Chủ phòng</Badge> : null}
      </div>
      <span
        className={`lobby-player__ready-dot ${player.ready
          ? 'lobby-player__ready-dot--ready'
          : 'lobby-player__ready-dot--not-ready'}`}
        aria-label={readyLabel}
      >
        <ActionIcon name={player.ready ? 'ready' : 'clock'} />
        {readyLabel}
      </span>
      {!player.connected
        ? (
          <span className="lobby-player__disconnect" role="img" aria-label="Mất kết nối" title="Mất kết nối">
            <ActionIcon name="offline" />
          </span>
        )
        : null}
      {isSelf
        ? (
          <>
            <Button
              variant={player.ready ? 'secondary' : 'primary'}
              className="lobby-player__ready-action"
              icon={<ActionIcon name={player.ready ? 'unready' : 'ready'} />}
              disabled={busy || !player.connected || needsMascot}
              title={needsMascot ? NO_MASCOT_HINT : undefined}
              aria-describedby={needsMascot ? hintId : undefined}
              onClick={() => onSetReady(!player.ready)}
            >
              <span>{player.ready ? 'Hủy sẵn sàng' : 'Sẵn sàng'}</span>
            </Button>
            {needsMascot ? <span className="lobby-player__hint" id={hintId}>{NO_MASCOT_HINT}</span> : null}
          </>
        )
        : null}
    </li>
  );
}

/** A seat nobody has taken yet; it tells the host how to fill it. */
export function EmptySeat({ number }: { number: number }) {
  return (
    <li className="lobby-player lobby-player--empty">
      <div className="lobby-player__stage">
        <span className="lobby-player__disc" aria-hidden="true" />
      </div>
      <span className="lobby-player__name">{`Chỗ trống ${number}`}</span>
      <span className="lobby-player__hint">Chia sẻ mã phòng để mời bạn</span>
    </li>
  );
}
