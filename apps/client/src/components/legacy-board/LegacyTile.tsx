import { useContext, type CSSProperties } from 'react';
import type { Tile as TileData } from '@monopoly/shared';
import { motion, useReducedMotion } from 'framer-motion';
import stateContext from '../../internal';
import displayPositionsContext from '../../displayPositionsContext';
import { formatMoney, getTileName } from '../../presentation';
import { getTileAccessibilityLabel } from './tileAccessibility';

interface LegacyTileProps {
  tile: TileData;
  id: number;
  position: string;
  selected: boolean;
  onSelect: () => void;
}

function PlayerTokens({ tileId }: { tileId: number }) {
  const { state } = useContext(stateContext);
  const displayPositions = useContext(displayPositionsContext);
  const reduced = useReducedMotion() ?? false;
  return (
    <div className="player__token--wrapper" aria-hidden="true">
      {Object.keys(state.players)
        .filter(playerKey => (displayPositions[playerKey] ?? state.players[playerKey].currentTile) === tileId)
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

export default function LegacyTile({
  tile, id, position, selected, onSelect,
}: LegacyTileProps) {
  const { state } = useContext(stateContext);
  const owned = state.boardState.ownedProps[id];
  const ownerColor = owned
    ? state.players[owned.id]?.color
      ?? state.boardState.finishedPlayers[owned.id]?.color
      ?? owned.color
    : undefined;
  const name = getTileName(id);
  const buildingLabel = owned && owned.houses > 0
    ? owned.houses === 5 ? '1 Khách Sạn' : `${owned.houses} Nhà`
    : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`Tile tile${id} ${position}`}
      id={String(id)}
      data-tile-index={id}
      aria-label={getTileAccessibilityLabel(id, state)}
      aria-expanded={selected}
    >
      {owned
        ? <span className="tile__owner-frame" title={`Tài sản của ${ownerColor ?? 'người chơi khác'}`} style={{ '--owner-color': ownerColor } as CSSProperties} />
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
