import { useContext, useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useAlert } from 'react-alert';
import './style/Dashboard.css';
import MarketPlace from './MarketPlace';
import stateContext from '../internal';
import displayPositionsContext from '../displayPositionsContext';
import tileNames from './BoardInitState';
import sellPromptContext from '../sellPromptContext';
import type { OfferOnProp, OfferResult } from '@monopoly/shared';

type ActiveOffer = OfferOnProp & { timer: number };

export default function Dashboard() {
  const {
    socketFunctions, state, playerId, socket,
  } = useContext(stateContext);
  const {
    openSale, setOpenSale, privateSale, setPrivateSale,
  } = useContext(sellPromptContext);
  const displayPositions = useContext(displayPositionsContext);

  // The buy prompt is driven by authoritative server state, which updates the
  // instant the move resolves — but the token is still walking there. Hold the
  // prompt until our token has actually reached its destination tile.
  const myPlayer = typeof playerId === 'string' ? state.players[playerId] : undefined;
  const tokenArrived = !myPlayer
    || (displayPositions[playerId as string] ?? myPlayer.currentTile) === myPlayer.currentTile;
  const [priceInput, setPriceInput] = useState(0);
  const [offer, setOffer] = useState(0);
  const [bidInput, setBidInput] = useState(0);
  const [offers, setOffers] = useState<ActiveOffer[]>([]);
  const alert = useAlert();
  const reduced = useReducedMotion() ?? false;
  const backdropMotion = reduced
    ? {}
    : {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.15 },
    };
  const modalMotion = reduced
    ? {}
    : {
      initial: { opacity: 0, scale: 0.9, y: 12 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.9, y: 12 },
      transition: { duration: 0.2, ease: 'easeOut' as const },
    };

  useEffect(() => {
    const interval = setInterval(() => {
      setOffers(prev => prev
        .map(item => ({ ...item, timer: item.timer - 1 }))
        .filter(item => item.timer !== 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onOffer = (info: OfferOnProp) => {
      setOffers(prev => [...prev, { ...info, timer: 20 }]);
    };

    const onDeclined = (info: OfferResult) => {
      const { tileName, price, ownerName } = info;
      alert.show(`${ownerName} declined your offer to buy ${tileName} for $${price}M`);
    };

    const onAccepted = (info: OfferResult) => {
      const { tileName, price, ownerName } = info;
      alert.show(`${ownerName} accepted your offer to buy ${tileName} for $${price}M`);
    };

    socket.on('offer on prop', onOffer);
    socket.on('offer declined', onDeclined);
    socket.on('offer accepted', onAccepted);

    return () => {
      socket.off('offer on prop', onOffer);
      socket.off('offer declined', onDeclined);
      socket.off('offer accepted', onAccepted);
    };
  }, [socket, alert]);

  const handleAcceptOffer = (chosen: ActiveOffer) => {
    setOffers(prev => prev.filter(item => item.tileID !== chosen.tileID));
    socketFunctions.acceptOffer(chosen);
  };

  const handleDeclineOffer = (chosen: ActiveOffer) => {
    setOffers(prev => prev.filter(item => item.tileID !== chosen.tileID));
    socketFunctions.declineOffer(chosen);
  };

  const removeSellPropPrompt = () => {
    setOpenSale(false);
    setPrivateSale(false);
  };

  return (
    <section className="center__dashboard--container">
      <section className="center__dashboard">
        <article className="center__dashboard--img" />

        <section className="center__dashboard__block center__dashboard__block--players">
          <h3 className="center__dashboard__title">Players</h3>

          {state.loaded
            ? (
              <ul className="player-list">
                {Object.keys(state.players).map((player) => {
                  const {
                    name, color, accountBalance, isJail, getOutOfJailCards,
                  } = state.players[player];
                  const isCurrent = state.boardState.currentPlayer.id === player;
                  return (
                    <li
                      key={player}
                      className={`player-card${isCurrent ? ' player-card--active' : ''}`}
                      style={{ borderLeftColor: color }}
                    >
                      <span className="player-card__disc" style={{ backgroundColor: color }}>
                        <span className="player-card__initial">{name.slice(0, 1).toUpperCase()}</span>
                      </span>
                      <div className="player-card__info">
                        <span className="player-card__name">
                          {name}
                          {isJail ? <span className="player-card__tag" title="In jail">🔒</span> : null}
                          {getOutOfJailCards > 0
                            ? (
                              <span className="player-card__tag" title="Get Out Of Jail Free card">
                                {getOutOfJailCards > 1 ? `🔑×${getOutOfJailCards}` : '🔑'}
                              </span>
                            )
                            : null}
                        </span>
                        <span className="player-card__balance">{`$${accountBalance}M`}</span>
                      </div>
                      {isCurrent ? <span className="player-card__turn">Now playing</span> : null}
                    </li>
                  );
                })}
              </ul>
            )
            : 'Loading...'}

          {state.loaded && Object.keys(state.boardState.finishedPlayers).length > 0
            ? (
              <>
                <h3 className="center__dashboard__title center__dashboard__title--sub">Bankrupt</h3>
                <ul className="player-list">
                  {Object.keys(state.boardState.finishedPlayers).map((player) => {
                    const { name, color } = state.boardState.finishedPlayers[player];
                    return (
                      <li
                        key={player}
                        className="player-card player-card--out"
                        style={{ borderLeftColor: color }}
                      >
                        <span className="player-card__disc" style={{ backgroundColor: color }}>
                          <span className="player-card__initial">{name.slice(0, 1).toUpperCase()}</span>
                        </span>
                        <div className="player-card__info">
                          <span className="player-card__name">{name}</span>
                          <span className="player-card__balance">Bankrupt</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )
            : null}
        </section>

        <section className="center__dashboard__block">
          {state.loaded
            && state.boardState.currentPlayer.id === playerId
            && myPlayer?.isJail
            ? (
              <section className="jail-panel">
                <h3 className="jail-panel__title">You're in jail!</h3>
                <p className="jail-panel__hint">Roll a double to escape, or:</p>
                <div className="jail-panel__actions">
                  <button
                    className="button__purchase--yes"
                    type="button"
                    disabled={myPlayer.accountBalance < 50}
                    onClick={() => socketFunctions.payBail()}
                  >
                    Pay $50M bail
                  </button>
                  {myPlayer.getOutOfJailCards > 0
                    ? (
                      <button
                        className="button__purchase--yes"
                        type="button"
                        onClick={() => socketFunctions.useJailCard()}
                      >
                        {`Use jail card (${myPlayer.getOutOfJailCards})`}
                      </button>
                    )
                    : null}
                </div>
              </section>
            )
            : null}
          <AnimatePresence>
            {state.loaded
              && state.boardState.currentPlayer.id === playerId
              && state.turnInfo.canBuyProp
              && tokenArrived
              ? (
                <motion.div key="buy-modal" className="modal__overlay" {...backdropMotion}>
                  <motion.div className="modal__card" {...modalMotion}>
                    {myPlayer && tileNames[myPlayer.currentTile]
                      ? (
                        <h3 className="open-market__sell-toast__title">
                          {`Buy ${tileNames[myPlayer.currentTile].streetName} for $${tileNames[myPlayer.currentTile].price}M?`}
                        </h3>
                      )
                      : <h3 className="open-market__sell-toast__title">Buy this property?</h3>}
                    <section className="center__dashboard__button__purchase">
                      <button className="button__purchase--yes" type="button" onClick={() => socketFunctions.buyProperty()}>
                        Buy property
                      </button>
                      <button className="button__purchase--no" type="button" onClick={() => socketFunctions.declineProperty()}>
                        Auction it instead
                      </button>
                    </section>
                  </motion.div>
                </motion.div>
              )
              : null}
          </AnimatePresence>
          <AnimatePresence>
            {state.loaded && openSale
              ? (
                <motion.div
                  key="open-sale-modal"
                  className="modal__overlay"
                  role="presentation"
                  onClick={removeSellPropPrompt}
                  {...backdropMotion}
                >
                  <motion.article
                    className="modal__card open-market__sell-toast"
                    role="presentation"
                    onClick={e => e.stopPropagation()}
                    {...modalMotion}
                  >
                    <h3 role="presentation" className="open-market__sell-toast__close" onClick={removeSellPropPrompt}>❌</h3>
                    <h3 className="open-market__sell-toast__title">
                      Sell
                      {' '}
                      {tileNames[openSale.tileID].streetName}
                      {' '}
                      for:
                    </h3>
                    <form
                      onSubmit={e => {
                        e.preventDefault();
                        if (openSale) {
                          socketFunctions.putOpenMarket({ ...openSale, price: priceInput });
                        }
                        setPriceInput(0);
                        setOpenSale(false);
                      }}
                      className="open-market__sell-toast__form"
                    >
                      <label htmlFor="open-sale-price"> Input in millions. (e.g. 200 = $200M)</label>
                      <div className="open-market__sell-toast__input--container">
                        <input
                          id="open-sale-price"
                          className="open-market__sell-toast__input"
                          onChange={e => setPriceInput(parseInt(e.target.value, 10))}
                          type="number"
                          min="20"
                          autoFocus
                        />
                        <button className="open-market__sell-toast__button" type="submit">Put on the open market</button>
                      </div>
                    </form>
                  </motion.article>
                </motion.div>
              )
              : null}
          </AnimatePresence>
          <AnimatePresence>
            {state.loaded && privateSale
              ? (
                <motion.div
                  key="private-sale-modal"
                  className="modal__overlay"
                  role="presentation"
                  onClick={removeSellPropPrompt}
                  {...backdropMotion}
                >
                  <motion.article
                    className="modal__card open-market__sell-toast"
                    role="presentation"
                    onClick={e => e.stopPropagation()}
                    {...modalMotion}
                  >
                    <h3 role="presentation" className="open-market__sell-toast__close" onClick={removeSellPropPrompt}>❌</h3>
                    <h3 className="open-market__sell-toast__title">
                      Make offer for
                      {' '}
                      {tileNames[privateSale.tileID].streetName}
                      {' '}
                      for:
                    </h3>
                    <form
                      onSubmit={e => {
                        e.preventDefault();
                        if (privateSale) socketFunctions.makeOffer({ ...privateSale, price: offer });
                        setOffer(0);
                        setPrivateSale(false);
                      }}
                      className="open-market__sell-toast__form"
                    >
                      <label htmlFor="private-offer-price">Input in millions. e.g. 200 = $200M</label>
                      <div className="open-market__sell-toast__input--container">
                        <input
                          id="private-offer-price"
                          className="open-market__sell-toast__input"
                          onChange={e => setOffer(parseInt(e.target.value, 10))}
                          type="number"
                          min="20"
                          autoFocus
                        />
                        <button className="open-market__sell-toast__button" type="submit">Make offer</button>
                      </div>
                    </form>
                  </motion.article>
                </motion.div>
              )
              : null}
          </AnimatePresence>
          <AnimatePresence>
            {state.loaded && offers.length !== 0
              ? (
                <motion.div key="offers-modal" className="modal__overlay" {...backdropMotion}>
                  <motion.div className="modal__card modal__card--offers" {...modalMotion}>
                    {offers.map(current => (
                      <section key={current.tileID} className="open-market__offer">
                        <h3 className="open-market__offer__title">
                          {`Offer from: ${current.buyerName}`}
                        </h3>
                        <h3 className="open-market__offer__title">
                          {`To buy: ${current.tileName}`}
                        </h3>
                        <p>{`Expires in: ${current.timer} seconds`}</p>
                        <p>{`The offer is for $${current.price}M.`}</p>
                        <div className="open-market__offer__buttons">
                          <button
                            className="open-market__sell-toast__button--yes"
                            onClick={() => handleAcceptOffer(current)}
                            type="button"
                          >
                            Accept
                          </button>
                          <button
                            className="open-market__sell-toast__button--no"
                            onClick={() => handleDeclineOffer(current)}
                            type="button"
                          >
                            Decline
                          </button>
                        </div>
                      </section>
                    ))}
                  </motion.div>
                </motion.div>
              )
              : null}
          </AnimatePresence>
          <AnimatePresence>
            {state.loaded && state.boardState.auction
              ? (
                <motion.div key="auction-modal" className="modal__overlay" {...backdropMotion}>
                  <motion.div className="modal__card modal__card--offers" {...modalMotion}>
                    <h3 className="open-market__offer__title">
                      {`Auction: ${state.boardState.auction.tileName}`}
                    </h3>
                    <p>{`List price: $${state.boardState.auction.price}M`}</p>
                    <p>
                      {state.boardState.auction.highestBidder
                        ? `Highest bid: $${state.boardState.auction.highestBid}M by ${state.boardState.auction.highestBidderName}`
                        : 'No bids yet'}
                    </p>
                    <p>{`Closes in: ${state.boardState.auction.timer}s`}</p>
                    {state.boardState.auction.active.includes(playerId as string)
                      ? (
                        <>
                          <form
                            className="open-market__offer__buttons"
                            onSubmit={e => {
                              e.preventDefault();
                              socketFunctions.placeBid(bidInput);
                              setBidInput(0);
                            }}
                          >
                            <input
                              className="open-market__sell-toast__input"
                              type="number"
                              min={state.boardState.auction.highestBid + 1}
                              value={bidInput || ''}
                              onChange={e => setBidInput(parseInt(e.target.value, 10) || 0)}
                              placeholder="Your bid"
                            />
                            <button className="open-market__sell-toast__button--yes" type="submit">Bid</button>
                          </form>
                          <button
                            className="open-market__sell-toast__button--no"
                            type="button"
                            onClick={() => socketFunctions.passBid()}
                          >
                            Pass
                          </button>
                        </>
                      )
                      : <p>You have passed on this auction.</p>}
                  </motion.div>
                </motion.div>
              )
              : null}
          </AnimatePresence>
          <AnimatePresence>
            {state.loaded && state.boardState.winner
              ? (
                <motion.div key="winner-modal" className="modal__overlay" {...backdropMotion}>
                  <motion.div className="modal__card" {...modalMotion}>
                    <h2 className="open-market__sell-toast__title">🏆 Game over!</h2>
                    <h3
                      className="open-market__sell-toast__title"
                      style={{ color: state.boardState.winner.color }}
                    >
                      {`${state.boardState.winner.name} wins!`}
                    </h3>
                  </motion.div>
                </motion.div>
              )
              : null}
          </AnimatePresence>
          {state.loaded && !state.boardState.gameStarted
            ? (
              <button className="button__start-game" type="button" onClick={() => socketFunctions.startGame()}>
                Start game
              </button>
            )
            : null}
        </section>
        <MarketPlace />
      </section>
      <section className="center__dashboard--current-player">
        <h2 className="center__dashboard__player-info">Current player:</h2>
        <h3 className="center__dashboard__player-info__current">
          {state.loaded
            ? (
              state.players[state.boardState.currentPlayer.id] ? `${state.players[state.boardState.currentPlayer.id].name}` : 'None'
            )
            : 'Loading...'}
        </h3>
      </section>
    </section>
  );
}
