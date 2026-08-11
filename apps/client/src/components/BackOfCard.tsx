import { useState, useContext, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { tileState, colorGroups } from '@monopoly/shared';
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
  const {
    state, playerId, socketFunctions, canMutate,
  } = useContext(stateContext);
  const { handlePutOpenMarket, handleMakeOffer } = useContext(sellPromptContext);
  const reduced = useReducedMotion() ?? false;
  const owned = state.boardState.ownedProps[id];
  const tile = tileState[id];

  // Mirror the server's build/mortgage rules so buttons can be enabled/disabled
  // (the server still validates every action authoritatively).
  const isStreet = tile?.tileType === 'normal' && typeof tile.houseCost === 'number';
  const group = tile?.color ? colorGroups[tile.color] : undefined;
  const ownsGroup = !!group && group.every(t => state.boardState.ownedProps[t]?.id === playerId);
  const groupHouses = group ? group.map(t => state.boardState.ownedProps[t]?.houses ?? 0) : [];
  const minGroupHouses = groupHouses.length ? Math.min(...groupHouses) : 0;
  const maxGroupHouses = groupHouses.length ? Math.max(...groupHouses) : 0;
  const groupHasMortgage = !!group && group.some(t => state.boardState.ownedProps[t]?.mortgaged);
  const myBalance = typeof playerId === 'string' ? state.players[playerId]?.accountBalance ?? 0 : 0;
  const houseCost = tile?.houseCost ?? 0;
  const houses = owned?.houses ?? 0;
  const isMortgaged = !!owned?.mortgaged;
  const mortgageValue = Math.floor((tile?.price ?? 0) / 2);
  const unmortgageCost = Math.ceil(((tile?.price ?? 0) / 2) * 1.1);

  const canBuild = isStreet && ownsGroup && !groupHasMortgage && !isMortgaged
    && houses < 5 && houses === minGroupHouses && myBalance >= houseCost;
  const canSellHouse = isStreet && houses > 0 && houses === maxGroupHouses;
  const canMortgage = !isMortgaged && houses === 0;
  const canUnmortgage = isMortgaged && myBalance >= unmortgageCost;

  const buildTitle = (() => {
    if (canBuild) return `Build a house ($${houseCost}M)`;
    if (!ownsGroup) return 'Own the whole colour group to build';
    if (groupHasMortgage || isMortgaged) return 'Unmortgage the group first';
    if (houses >= 5) return 'Already has a hotel';
    if (houses !== minGroupHouses) return 'Build evenly across the group first';
    return `Can't afford a house ($${houseCost}M)`;
  })();
  const sellHouseTitle = (() => {
    if (canSellHouse) return 'Sell a house';
    if (houses === 0) return 'No houses to sell';
    return 'Sell from the most-built property first';
  })();
  const mortgageTitle = (() => {
    if (canMortgage) return `Mortgage for $${mortgageValue}M`;
    if (houses > 0) return 'Sell all houses in the group first';
    return 'Already mortgaged';
  })();
  const unmortgageTitle = canUnmortgage
    ? `Unmortgage for $${unmortgageCost}M`
    : `Unmortgage costs $${unmortgageCost}M — can't afford`;

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
        {ownership && canMutate
          ? ownership !== playerId
            ? (
              <section className="tile-back__buttons">
                <button type="button" onClick={e => { e.stopPropagation(); handleMakeOffer(id); }} className="tile-back__button">Make offer</button>
              </section>
            )
            : (
              <section className="tile-back__buttons">
                {isStreet && !isMortgaged
                  ? (
                    <>
                      <button type="button" disabled={!canBuild} title={buildTitle} onClick={e => { e.stopPropagation(); socketFunctions.buildHouse(id); }} className="tile-back__button">Build</button>
                      <button type="button" disabled={!canSellHouse} title={sellHouseTitle} onClick={e => { e.stopPropagation(); socketFunctions.sellHouse(id); }} className="tile-back__button">Sell&nbsp;house</button>
                    </>
                  )
                  : null}
                {isMortgaged
                  ? <button type="button" disabled={!canUnmortgage} title={unmortgageTitle} onClick={e => { e.stopPropagation(); socketFunctions.unmortgageProperty(id); }} className="tile-back__button">Unmortgage</button>
                  : <button type="button" disabled={!canMortgage} title={mortgageTitle} onClick={e => { e.stopPropagation(); socketFunctions.mortgageProperty(id); }} className="tile-back__button">Mortgage</button>}
                <button type="button" title="List on the open market" onClick={e => { e.stopPropagation(); handlePutOpenMarket(id); }} className="tile-back__button">Sell</button>
              </section>
            )
          : null}
      </article>
    </motion.div>
  );
};

export default BackOfCard;
