import { useContext, useMemo, type CSSProperties } from 'react';
import stateContext from '../../../internal';
import { usePresentation } from '../../presentation/PresentationProvider';
import { characterSvgDataUri } from '../../characters/characterSvg';
import { getCharacterDefinition } from '../../characters/characterRegistry';
import { getPlayerDisplayColor } from '../playerVisualColors';
import { formatMoney } from '../formatters';
import { selectPlayerHudViewModels } from '../hud/playerHudSelectors';
import { resolvePlayerStationSlots } from './stationSlots';
import './PlayerStations.css';

export default function PlayerStations({ activePlayerId }: { activePlayerId: string }) {
  const { state, playerId, role, roomPlayers = [] } = useContext(stateContext);
  const { state: presentation } = usePresentation();
  const players = state.loaded ? selectPlayerHudViewModels(state, activePlayerId, roomPlayers) : [];
  const slots = useMemo(
    () => resolvePlayerStationSlots(roomPlayers, playerId, role),
    [playerId, role, roomPlayers],
  );
  const latestDelta = new Map<string, (typeof presentation.balanceDeltas)[number]>();
  presentation.balanceDeltas.forEach(delta => latestDelta.set(delta.playerId, delta));
  const latest = presentation.activeBoardEvent;
  const announcement = latest
    ? `${latest.kind}${latest.amount ? ` ${formatMoney(latest.amount)}` : ''}`
    : '';

  return (
    <section className="player-stations" aria-label="Trạm người chơi">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
      {players.map(player => {
        const slot = slots.get(player.playerId);
        if (!slot) return null;
        const character = getCharacterDefinition(player.characterId);
        const color = getPlayerDisplayColor(player.color);
        const delta = latestDelta.get(player.playerId);
        const status = player.hasLeft ? 'Đã rời ván' : player.isBankrupt ? 'Phá sản' : null;
        return (
          <article
            key={player.playerId}
            className={`player-station player-station--${slot.toLowerCase()}${player.isCurrentTurn ? ' player-station--active' : ''}${status ? ' player-station--finished' : ''}`}
            style={{ '--station-color': color } as CSSProperties}
            data-player-id={player.playerId}
            data-station-slot={slot}
          >
            <span className="player-station__turn-pin" aria-hidden="true" />
            <img
              className="player-station__mascot"
              src={characterSvgDataUri(character.svgSource, player.color)}
              alt=""
            />
            <div className="player-station__identity">
              <strong title={player.name}>{player.name}</strong>
              <span>{status ?? formatMoney(player.money)}</span>
            </div>
            {delta?.delta
              ? <span className={`player-station__delta player-station__delta--${delta.delta > 0 ? 'up' : 'down'}`}>{delta.delta > 0 ? '+' : '-'}{formatMoney(Math.abs(delta.delta))}</span>
              : null}
            <div className="player-station__assets" aria-label={`${player.propertyCount} tài sản, ${player.houseCount} nhà, ${player.hotelCount} khách sạn`}>
              <span>ĐẤT {player.propertyCount}</span>
              <span>NHÀ {player.houseCount}</span>
              <span>KS {player.hotelCount}</span>
            </div>
            <span
              className={`player-station__connection${player.isConnected ? '' : ' player-station__connection--offline'}`}
              title={player.isConnected ? 'Đang kết nối' : 'Mất kết nối'}
              aria-label={player.isConnected ? 'Đang kết nối' : 'Mất kết nối'}
            />
          </article>
        );
      })}
    </section>
  );
}
