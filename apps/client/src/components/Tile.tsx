import { useContext } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import './style/Board.css';
import stateContext from '../internal';
import BackOfCard from './BackOfCard';
import cardFlipContext from '../cardFlipContext';
import type { BoardInitTile } from './BoardInitState';

interface TileProps {
  initState: BoardInitTile;
  id: number;
  position: string;
}

// Renders the tokens of every player currently standing on this tile. Each token
// carries a stable `layoutId`, so when a player moves the token glides from its
// old tile to the new one (framer-motion shared-layout animation).
function PlayerTokens({ tileId }: { tileId: number }) {
  const { state } = useContext(stateContext);
  const reduced = useReducedMotion() ?? false;
  return (
    <div className="player__token--wrapper">
      {Object.keys(state.players)
        .filter(playerKey => state.players[playerKey].currentTile === tileId)
        .map(playerKey => (
          <motion.div
            key={playerKey}
            layoutId={`token-${playerKey}`}
            className="player__token"
            style={{ backgroundColor: state.players[playerKey].color }}
            transition={reduced
              ? { duration: 0 }
              : { type: 'spring', stiffness: 500, damping: 40 }}
          />
        ))}
    </div>
  );
}

function Tile({ initState, id, position }: TileProps) {
  const { state } = useContext(stateContext);
  const { cardsBack, dispatch } = useContext(cardFlipContext);

  const handleCardClick = () => {
    const cardsFlipped = cardsBack.map((card, index) => {
      if (card.clicked) return { ...card, clicked: false };
      if (index === id) return { ...card, clicked: true };
      return card;
    });
    dispatch({ type: 'FLIP_CARD', payload: cardsFlipped });
  };

  if (!cardsBack[id].clicked) {
    return (
      <article role="presentation" onClick={handleCardClick} className={`Tile tile${id} ${position}`} id={String(id)}>
        {initState.color && initState.color !== 'railroad'
          ? (
            <>
              <div
                className="tile__color-box"
                style={
                  state.loaded
                    && Object.prototype.hasOwnProperty.call(state.boardState.ownedProps, id)
                    ? { backgroundColor: initState.color, boxShadow: `0px 0px 1px 3px ${state.boardState.ownedProps[id].color}` }
                    : { backgroundColor: initState.color }
                }
              />
              <div className="tile__wrapper">
                <p className="tile__street-name">{initState.streetName}</p>
                <PlayerTokens tileId={id} />
                <p className="tile__price">{`$${initState.price}M`}</p>
              </div>
            </>
          )
          : (
            <div
              className="tile__special--wrapper"
              style={
                state.loaded
                  && Object.prototype.hasOwnProperty.call(state.boardState.ownedProps, id)
                  ? { boxShadow: `0px 0px 1px 3px ${state.boardState.ownedProps[id].color}` }
                  : {}
              }
            >
              <p className="tile__special-name">{initState.streetName}</p>
              <PlayerTokens tileId={id} />
              <p className="tile__special--price">{initState.price ? `$${initState.price}M` : ''}</p>
            </div>
          )}
      </article>
    );
  }
  return <BackOfCard id={id} handleCardClick={handleCardClick} position={position} />;
}

export default Tile;
