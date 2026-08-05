import { useState, useContext, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { tileState } from '@monopoly/shared';
import cardFlipContext from '../cardFlipContext';
import stateContext from '../internal';
import sellPromptContext from '../sellPromptContext';
import './style/BackOfCard.css';

interface BackOfCardProps {
  id: number;
  handleCardClick: () => void;
  position: string;
}

const BackOfCard = ({ id, handleCardClick, position }: BackOfCardProps) => {
  const { cardsBack } = useContext(cardFlipContext);
  const [backOfCard] = useState(cardsBack[id]);
  const [ownership, setOwnership] = useState<string | false>(false);
  const { state, playerId, socketFunctions } = useContext(stateContext);
  const { handlePutOpenMarket, handleMakeOffer } = useContext(sellPromptContext);
  const reduced = useReducedMotion() ?? false;
  const owned = state.boardState.ownedProps[id];
  const tile = tileState[id];
  const canBuild = tile?.tileType === 'normal' && typeof tile.houseCost === 'number';

  useEffect(() => {
    if (Object.prototype.hasOwnProperty.call(state.boardState.ownedProps, id)) {
      setOwnership(state.boardState.ownedProps[id].id);
    } else {
      setOwnership(false);
    }
  }, [state.boardState.ownedProps, id]);

  return (
    <motion.div
      className="tile-back--container"
      initial={reduced ? { opacity: 0 } : { rotateY: -90, opacity: 0 }}
      animate={reduced ? { opacity: 1 } : { rotateY: 0, opacity: 1 }}
      transition={reduced ? { duration: 0 } : { duration: 0.35, ease: 'easeOut' }}
      style={{ transformPerspective: 600 }}
    >
      <article role="presentation" onClick={handleCardClick} className={`Tile-back tile-back__${position}`}>
        <p className="tile-back__name" style={backOfCard.color ? { backgroundColor: backOfCard.color } : { backgroundColor: 'none' }}>{backOfCard.cardName}</p>
        <section className="tile-back__prices">
          <p className="tile-back__price">{backOfCard.price ? `Price: $${backOfCard.price}` : ''}</p>
          <p className="tile-back__rent">{backOfCard.rent ? `Rent: $${backOfCard.rent}` : ''}</p>
        </section>
        <p className="tile-back__line" />
        <section className="tile-back__details--wrapper">
          <p className="tile-back__details">{backOfCard.details1 && backOfCard.details1.includes('$') ? `${backOfCard.details1.split('$')[0]}` : backOfCard.details1}</p>
          <span className="tile-back__details--price">{backOfCard.details1 && backOfCard.details1.includes('$') ? `$${backOfCard.details1.split('$')[1]}` : ''}</span>
        </section>
        <section className="tile-back__details--wrapper">
          <p className="tile-back__details">{backOfCard.details2 && backOfCard.details2.includes('$') ? `${backOfCard.details2.split('$')[0]}` : backOfCard.details2}</p>
          <span className="tile-back__details--price">{backOfCard.details2 && backOfCard.details2.includes('$') ? `$${backOfCard.details2.split('$')[1]}` : ''}</span>
        </section>
        <section className="tile-back__details--wrapper">
          <p className="tile-back__details">{backOfCard.details3 ? `${backOfCard.details3.split('$')[0]}` : ''}</p>
          <span className="tile-back__details--price">{backOfCard.details3 ? `$${backOfCard.details3.split('$')[1]}` : ''}</span>
        </section>
        <section className="tile-back__details--wrapper">
          <p className="tile-back__details">{backOfCard.details4 ? `${backOfCard.details4.split('$')[0]}` : ''}</p>
          <span className="tile-back__details--price">{backOfCard.details4 ? `$${backOfCard.details4.split('$')[1]}` : ''}</span>
        </section>
        {owned?.mortgaged
          ? <p className="tile-back__mortgaged">MORTGAGED</p>
          : null}
        {owned && owned.houses > 0
          ? (
            <p className="tile-back__houses">
              {owned.houses === 5 ? '🏨 Hotel' : `🏠 ${owned.houses} house${owned.houses > 1 ? 's' : ''}`}
            </p>
          )
          : null}
        {ownership
          ? ownership !== playerId
            ? (
              <section className="tile-back__buttons">
                <button type="button" onClick={e => { e.stopPropagation(); handleMakeOffer(id); }} className="tile-back__button">Make offer</button>
              </section>
            )
            : (
              <section className="tile-back__buttons">
                {canBuild
                  ? (
                    <>
                      <button type="button" onClick={e => { e.stopPropagation(); socketFunctions.buildHouse(id); }} className="tile-back__button">Build</button>
                      <button type="button" onClick={e => { e.stopPropagation(); socketFunctions.sellHouse(id); }} className="tile-back__button">Sell house</button>
                    </>
                  )
                  : null}
                {owned?.mortgaged
                  ? <button type="button" onClick={e => { e.stopPropagation(); socketFunctions.unmortgageProperty(id); }} className="tile-back__button">Unmortgage</button>
                  : <button type="button" onClick={e => { e.stopPropagation(); socketFunctions.mortgageProperty(id); }} className="tile-back__button">Mortgage</button>}
                <button type="button" onClick={e => { e.stopPropagation(); handlePutOpenMarket(id); }} className="tile-back__button">Sell</button>
              </section>
            )
          : null}
      </article>
    </motion.div>
  );
};

export default BackOfCard;
