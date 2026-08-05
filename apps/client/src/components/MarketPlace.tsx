import { useContext } from 'react';
import stateContext from '../internal';
import './style/MarketPlace.css';

const MarketPlace = () => {
  const { socketFunctions, state, playerId } = useContext(stateContext);
  const { openMarket } = state.boardState;
  const items = Object.keys(openMarket);

  return (
    <section className="dashboard__market-place--container">
      <h1 className="dashboard__market-place__title">The open market:</h1>
      <section className="dashboard__market-place">
        <section className="dashboard__market-place__block">
          <h3 className="dashboard__market-place__subtitle">Seller</h3>
          {state.loaded
            ? items.map(item => (
              <p key={item}>{openMarket[Number(item)].sellerName}</p>
            ))
            : null}
        </section>
        <section className="dashboard__market-place__block">
          <h3 className="dashboard__market-place__subtitle">Property</h3>
          {state.loaded
            ? items.map(item => (
              <p key={item}>{openMarket[Number(item)].tileName}</p>
            ))
            : null}
        </section>
        <section className="dashboard__market-place__block">
          <h3 className="dashboard__market-place__subtitle">Price</h3>
          {state.loaded
            ? items.map(item => (
              <p key={item}>
                $
                {openMarket[Number(item)].price}
                M
              </p>
            ))
            : null}
        </section>
        <section className="dashboard__market-place__block">
          {state.loaded
            ? items.map(item => (
              <div key={item} className="dashboard__market-place__buttons">
                {openMarket[Number(item)].seller === playerId
                  ? <p role="presentation" onClick={() => socketFunctions.removeSale(item)} className="dashboard__market-place__icon-x">❌</p>
                  : <p role="presentation" onClick={() => socketFunctions.makeSale(item)} className="dashboard__market-place__icon-v">✓</p>}
              </div>
            ))
            : null}
        </section>
      </section>
    </section>
  );
};

export default MarketPlace;
