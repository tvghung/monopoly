import Badge from '../../../design-system/components/Badge/Badge';
import { characterSvgDataUri } from '../../characters/characterSvg';
import { getCharacterDefinition } from '../../characters/characterRegistry';
import { formatMoney } from '../formatters';
import { getPlayerDisplayColor, getPlayerDisplayForeground } from '../playerVisualColors';
import type { PlayerHudViewModel } from './playerHudSelectors';

export default function PlayerCard({ player }: { player: PlayerHudViewModel }) {
  const status = player.hasLeft ? 'Đã rời ván' : player.isBankrupt ? 'Phá sản' : null;
  const displayColor = getPlayerDisplayColor(player.color);
  const foregroundColor = getPlayerDisplayForeground(player.color);
  const character = getCharacterDefinition(player.characterId);
  return (
    <li
      className={'player-card' + (player.isCurrentTurn ? ' player-card--active' : '') + (status ? ' player-card--out' : '')}
      style={{ borderLeftColor: displayColor }}
      data-player-id={player.playerId}
    >
      <span className="player-card__disc" style={{ backgroundColor: displayColor }} aria-hidden="true">
        <span className="player-card__initial" style={{ color: foregroundColor }}>{player.name.slice(0, 1).toUpperCase()}</span>
      </span>
      <img
        className="player-card__mascot"
        src={characterSvgDataUri(character.svgSource, player.color)}
        alt={`${character.displayName} của ${player.name}`}
      />
      <div className="player-card__info">
        <span className="player-card__name">
          {player.name}
          {player.isInJail ? <span className="player-card__tag" aria-label="Đang ở Nhà Tù">🔒</span> : null}
          {player.jailFreeCardCount > 0
            ? <span className="player-card__tag" aria-label={'Có ' + player.jailFreeCardCount + ' thẻ Thoát Tù'}>🔑</span>
            : null}
        </span>
        <span className="player-card__balance">{status ?? formatMoney(player.money)}</span>
        <span className="player-card__stats">
          {player.propertyCount} tài sản · {player.houseCount} Nhà · {player.hotelCount} Khách sạn
        </span>
      </div>
      <div className="player-card__badges">
        {player.isCurrentTurn ? <Badge variant="info">Đang chơi</Badge> : null}
        {!player.isConnected ? <Badge variant="neutral">Mất kết nối</Badge> : null}
      </div>
    </li>
  );
}
