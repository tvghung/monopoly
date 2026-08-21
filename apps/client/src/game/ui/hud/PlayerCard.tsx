import { characterSvgDataUri } from '../../characters/characterSvg';
import { getCharacterDefinition } from '../../characters/characterRegistry';
import { formatMoney } from '../formatters';
import { getPlayerDisplayColor } from '../playerVisualColors';
import type { PlayerHudViewModel } from './playerHudSelectors';

export default function PlayerCard({ player }: { player: PlayerHudViewModel }) {
  const status = player.hasLeft ? 'Đã rời ván' : player.isBankrupt ? 'Phá sản' : null;
  const displayColor = getPlayerDisplayColor(player.color);
  const character = getCharacterDefinition(player.characterId);
  return (
    <li
      className={'player-card' + (player.isCurrentTurn ? ' player-card--active' : '') + (status ? ' player-card--out' : '')}
      style={{ borderLeftColor: displayColor }}
      data-player-id={player.playerId}
    >
      <span className="player-card__color" style={{ backgroundColor: displayColor }} aria-hidden="true" />
      <img
        className="player-card__mascot"
        src={characterSvgDataUri(character.svgSource, player.color)}
        alt={`${character.displayName} của ${player.name}`}
      />
      <div className="player-card__info">
        <span className="player-card__name" title={player.name}>{player.name}</span>
        <span className="player-card__balance">{status ?? formatMoney(player.money)}</span>
      </div>
      <div className="player-card__badges">
        {player.isCurrentTurn ? <span className="player-card__turn">Đến lượt</span> : null}
        {!player.isConnected ? <span className="player-card__connection">Mất kết nối</span> : null}
        {player.isInJail ? <span className="player-card__state">Nhà Tù</span> : null}
      </div>
    </li>
  );
}
