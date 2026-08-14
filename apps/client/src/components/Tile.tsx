import { useContext, type CSSProperties } from 'react';
import type { Tile as TileData } from '@monopoly/shared';
import { motion, useReducedMotion } from 'framer-motion';
import './style/Board.css';
import stateContext from '../internal';
import displayPositionsContext from '../displayPositionsContext';
import { formatMoney, getTileName } from '../presentation';
import BackOfCard from './BackOfCard';

interface TileProps {
  tile: TileData;
  id: number;
  position: string;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

// Renders the tokens of every player currently standing on this tile. Each token
// carries a stable layoutId, so movement can animate between adjacent tiles.
function PlayerTokens({ tileId }: { tileId: number }) {
  const { state } = useContext(stateContext);
  const displayPositions = useContext(displayPositionsContext);
  const reduced = useReducedMotion() ?? false;
  return (
    <div className="player__token--wrapper" aria-hidden="true">
      {Object.keys(state.players)
        .filter(playerKey => (displayPositions[playerKey] ?? state.players[playerKey].currentTile)
          === tileId)
        .map(playerKey => (
          <motion.div
            key={playerKey}
            layoutId={`token-${playerKey}`}
            className="player__token"
            style={{ backgroundColor: state.players[playerKey].color }}
            transition={reduced
              ? { duration: 0 }
              : { type: 'tween', ease: 'linear', duration: 0.18 }}
          >
            <span className="player__token-initial">
              {state.players[playerKey].name.slice(0, 1).toUpperCase()}
            </span>
          </motion.div>
        ))}
    </div>
  );
}

function Tile({
  tile, id, position, isOpen, onOpen, onClose,
}: TileProps) {
  const { state } = useContext(stateContext);
  const owned = state.loaded ? state.boardState.ownedProps[id] : undefined;
  const ownerName = owned
    ? state.players[owned.id]?.name
      ?? state.boardState.finishedPlayers[owned.id]?.name
      ?? 'người chơi khác'
    : null;
  const playersHere = Object.values(state.players)
    .filter(player => player.currentTile === id)
    .map(player => player.name);
  const name = getTileName(id);
  const buildingLabel = owned && owned.houses > 0
    ? owned.houses === 5 ? '1 Khách Sạn' : `${owned.houses} Nhà`
    : null;
  const accessibleLabel = [
    `Ô ${id}: ${name}`,
    typeof tile.price === 'number' ? `Giá ${formatMoney(tile.price)}` : null,
    ownerName ? `Chủ sở hữu: ${ownerName}` : null,
    buildingLabel ? `Có ${buildingLabel}` : null,
    playersHere.length > 0 ? `Người chơi đang đứng: ${playersHere.join(', ')}` : null,
    'Mở chi tiết ô cờ',
  ].filter(Boolean).join('. ');

  if (isOpen) {
    return <BackOfCard id={id} tile={tile} onClose={onClose} position={position} />;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`Tile tile${id} ${position}`}
      id={String(id)}
      data-tile-index={id}
      aria-label={accessibleLabel}
      aria-expanded="false"
    >
      {owned
        ? (
          <span
            className="tile__owner-frame"
            title={`Tài sản của ${ownerName}`}
            style={{ '--owner-color': owned.color } as CSSProperties}
          />
        )
        : null}
      {buildingLabel
        ? (
          <span className="tile__buildings" title={buildingLabel}>
            {owned?.houses === 5
              ? <span className="tile__building tile__building--hotel" />
              : Array.from({ length: owned?.houses ?? 0 }).map((_unused, index) => (
                <span key={`house-${index}`} className="tile__building" />
              ))}
          </span>
        )
        : null}
      {tile.color && tile.color !== 'railroad'
        ? (
          <>
            <span className="tile__color-box" style={{ backgroundColor: tile.color }} />
            <span className="tile__wrapper">
              <span className="tile__street-name">{name}</span>
              <PlayerTokens tileId={id} />
              <span className="tile__price">
                {typeof tile.price === 'number' ? formatMoney(tile.price) : ''}
              </span>
            </span>
          </>
        )
        : (
          <span className="tile__special--wrapper">
            <span className="tile__special-name">{name}</span>
            <PlayerTokens tileId={id} />
            <span className="tile__special--price">
              {typeof tile.price === 'number' ? formatMoney(tile.price) : ''}
            </span>
          </span>
        )}
    </button>
  );
}

export default Tile;
