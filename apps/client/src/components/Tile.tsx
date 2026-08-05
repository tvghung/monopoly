import { useContext } from 'react';
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
                <div className="player__token--wrapper">
                  {Object.keys(state.players).map(e => (
                    state.players[e].currentTile === id
                      ? <div key={e} className="player__token" style={{ backgroundColor: state.players[e].color }} />
                      : <div key={e} />
                  ))}
                </div>
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
              <div className="player__token--wrapper">
                {Object.keys(state.players).map(e => (
                  state.players[e].currentTile === id
                    ? <div key={e} className="player__token" style={{ backgroundColor: state.players[e].color }} />
                    : <div key={e} />
                ))}
              </div>
              <p className="tile__special--price">{initState.price ? `$${initState.price}M` : ''}</p>
            </div>
          )}
      </article>
    );
  }
  return <BackOfCard id={id} handleCardClick={handleCardClick} position={position} />;
}

export default Tile;
