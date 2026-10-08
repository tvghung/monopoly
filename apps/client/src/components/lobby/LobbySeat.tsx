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
import { useTranslation } from '../../i18n/I18n';

/**
 * The viewer's way to swap with the player of one seat (2v2 lobby). `IDLE`: the viewer may ask this player to exchange places.
 * `PENDING`: the viewer already asked this player and is waiting for the answer; the seat then offers to take the question back.
 * Both come straight from the open requests of the room state: the seat keeps nothing of its own.
 */
export interface SeatSwap {
  state: 'IDLE' | 'PENDING';
  onRequest: () => void;
  onCancel: () => void;
}

interface LobbySeatProps {
  player: LobbyPlayerView;
  /** The viewer's own seat: the only one with a ready button. */
  isSelf: boolean;
  isHost: boolean;
  busy: boolean;
  onSetReady: (ready: boolean) => void;
  /** Host only, and never on the host's own seat: the X that removes this player (a bot at once, a human after a question). */
  onKick?: () => void;
  /** 2v2 only, and never on the viewer's own seat: the swap control of this seat. */
  swap?: SeatSwap | null;
}

/** One seated player: the mascot on a pedestal in the player color, name, ready stamp and presence. No mascot name is shown. */
export function LobbySeat({
  player, isSelf, isHost, busy, onSetReady, onKick, swap = null,
}: LobbySeatProps) {
  const { language, t } = useTranslation();
  const hintId = useId();
  const needsMascot = player.characterId === null;
  const seatStyle = {
    '--seat-color': getPlayerDisplayColor(player.color),
    '--seat-color-dark': getPlayerAccentDarkColor(player.color),
  } as CSSProperties;
  const isBot = player.kind === 'BOT';
  const readyLabel = player.ready ? t('lobby.readyStatus') : t('lobby.notReadyStatus');
  const className = [
    'lobby-player',
    'lobby-player--occupied',
    player.connected ? '' : 'lobby-player--disconnected',
    isSelf ? 'lobby-player--self' : '',
    isBot ? 'lobby-player--bot' : '',
    onKick ? 'lobby-player--kickable' : '',
    swap?.state === 'PENDING' ? 'lobby-player--swap-pending' : '',
  ].filter(Boolean).join(' ');

  return (
    <li className={className} style={seatStyle} data-team={player.teamId} data-player-id={player.id} data-kind={player.kind}>
      {onKick
        ? (
          <IconButton
            className="lobby-player__kick"
            label={isBot ? t('lobby.removeBot', { name: player.name }) : t('lobby.kick', { name: player.name })}
            icon={isBot ? 'removeBot' : 'close'}
            disabled={busy}
            onClick={onKick}
          />
        )
        : null}
      <div className="lobby-player__stage">
        <span className="lobby-player__disc" role="img" aria-label={t('lobby.color', { name: getPlayerColorLabel(player.color, language) })} />
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
          {isSelf ? t('lobby.selfSuffix') : ''}
        </span>
        {isHost ? <Badge variant="warning">{t('lobby.hostBadge')}</Badge> : null}
        {isBot
          ? (
            <Badge variant="info" className="lobby-player__bot-badge">
              <ActionIcon name="bot" />
              {t('lobby.botBadge')}
            </Badge>
          )
          : null}
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
          <span className="lobby-player__disconnect" role="img" aria-label={t('status.disconnected')} title={t('status.disconnected')}>
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
              title={needsMascot ? t('lobby.noMascotHint') : undefined}
              aria-describedby={needsMascot ? hintId : undefined}
              onClick={() => onSetReady(!player.ready)}
            >
              <span>{player.ready ? t('lobby.cancelReady') : t('lobby.readyAction')}</span>
            </Button>
            {needsMascot ? <span className="lobby-player__hint" id={hintId}>{t('lobby.noMascotHint')}</span> : null}
          </>
        )
        : null}
      {swap?.state === 'IDLE'
        ? (
          <Button
            variant="ghost"
            className="lobby-player__swap-action"
            icon={<ActionIcon name="swap" />}
            disabled={busy}
            aria-label={t('lobby.requestSwap', { name: player.name })}
            onClick={swap.onRequest}
          >
            <span>{t('lobby.requestSwapShort')}</span>
          </Button>
        )
        : null}
      {swap?.state === 'PENDING'
        ? (
          <div className="lobby-player__swap-pending">
            <p className="lobby-player__swap-status" role="status">{t('lobby.waitingSwap', { name: player.name })}</p>
            <Button
              variant="ghost"
              size="sm"
              className="lobby-player__swap-cancel"
              icon={<ActionIcon name="close" />}
              disabled={busy}
              aria-label={t('lobby.cancelSwapWith', { name: player.name })}
              onClick={swap.onCancel}
            >
              <span>{t('lobby.cancelSwapShort')}</span>
            </Button>
          </div>
        )
        : null}
    </li>
  );
}

interface EmptySeatProps {
  number: number;
  /** Host only: adds one bot (one click, one seat). Absent for everyone else and when no bot can be added. */
  onAddBot?: () => void;
  /** 2v2 lobby: the name of the team the seat belongs to, for the label of its move control. */
  teamName?: string;
  busy?: boolean;
  /** 2v2 only: the viewer jumps into this seat at once. Absent in a Solo lobby, where positions mean nothing. */
  onMove?: () => void;
}

/** A seat nobody has taken yet; it tells the host how to fill it and, in a 2v2 lobby, lets the viewer move into it. */
export function EmptySeat({
  number, teamName, busy = false, onMove, onAddBot,
}: EmptySeatProps) {
  const { t } = useTranslation();
  return (
    <li className="lobby-player lobby-player--empty">
      <div className="lobby-player__stage">
        <span className="lobby-player__disc" aria-hidden="true" />
      </div>
      <span className="lobby-player__name">{t('lobby.emptySeatNumber', { number })}</span>
      {onAddBot
        ? (
          <Button
            variant="secondary"
            className="lobby-player__add-bot"
            icon={<ActionIcon name="addBot" />}
            disabled={busy}
            aria-label={t('lobby.addBotToSeat', { number })}
            onClick={onAddBot}
          >
            <span>{t('lobby.addBot')}</span>
          </Button>
        )
        : null}
      {onMove
        ? (
          <Button
            variant="ghost"
            className="lobby-player__swap-action"
            icon={<ActionIcon name="swap" />}
            disabled={busy}
            aria-label={t('lobby.moveToSeat', { number, teamName: teamName ?? '' })}
            onClick={onMove}
          >
            <span>{t('lobby.moveToSeatShort')}</span>
          </Button>
        )
        : null}
    </li>
  );
}
