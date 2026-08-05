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
  const [offers, setOffers] = useState<ActiveOffer[]>([]);
  const alert = useAlert();
  const reduced = useReducedMotion() ?? false;
  const toastMotion = reduced
    ? {}
    : {
      initial: { opacity: 0, scale: 0.9, y: -8 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.9, y: -8 },
      transition: { duration: 0.2, ease: 'easeOut' as const },
    };
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

        <section className="center__dashboard__block">
          <h3 className="center__dashboard__title">Players:</h3>

          {state.loaded
            ? Object.keys(state.players).map(player => (
              <section key={player} className="center__dashboard__players">
                <h3 className="center__dashboard__player-info__name" style={{ color: state.players[player].color, textShadow: '1px 1px 0 black, 1px -1px 0 grey, -1px 1px 0 black, -1px -1px 0 grey, 1px 0px 0 grey, 0px 1px 0 black, -1px 0px 0 grey, 0px -1px 0 grey' }}>
                  {state.players[player].name}
                </h3>
                <p className="center__dashboard__player-info">{`Account balance: $${state.players[player].accountBalance}M`}</p>
              </section>
            ))
            : 'Loading...'}

          {Object.keys(state.boardState.finishedPlayers).length > 0 ? <h3 className="center__dashboard__title">Broke Players:</h3> : null}
          {state.loaded
            ? Object.keys(state.boardState.finishedPlayers).map(player => (
              <section key={player} className="center__dashboard__players">
                <h3 className="center__dashboard__player-info__name" style={{ color: state.boardState.finishedPlayers[player].color, textShadow: '1px 1px 0 black, 1px -1px 0 grey, -1px 1px 0 black, -1px -1px 0 grey, 1px 0px 0 grey, 0px 1px 0 black, -1px 0px 0 grey, 0px -1px 0 grey' }}>
                  {state.boardState.finishedPlayers[player].name}
                </h3>
              </section>
            ))
            : 'Loading...'}
        </section>

        <section className="center__dashboard__block">
          <AnimatePresence>
            {state.loaded
              && state.boardState.currentPlayer.id === playerId
              && state.turnInfo.canBuyProp
              && tokenArrived
              ? (
                <motion.div className="open-market__sell-toast" {...toastMotion}>
                  <section className="center__dashboard__button__purchase">
                    <button className="button__purchase--yes" type="button" onClick={() => socketFunctions.buyProperty()}>
                      Buy property
                    </button>
                    <button className="button__purchase--no" type="button" onClick={() => socketFunctions.endTurn()}>
                      Do not buy property
                    </button>
                  </section>
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
