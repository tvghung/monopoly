import { useContext } from 'react';
import stateContext from '../internal';
import './style/MarketPlace.css';

export default function MarketPlace() {
  const {
    socketFunctions, state, playerId, canMutate,
  } = useContext(stateContext);
  const { openMarket } = state.boardState;
  const tileIds = Object.keys(openMarket).map(Number);

  return (
    <section className="dashboard__market-place--container">
      <h1 className="dashboard__market-place__title">The open market:</h1>
      <section className="dashboard__market-place">
        <section className="dashboard__market-place__block">
          <h3 className="dashboard__market-place__subtitle">Seller</h3>
          {state.loaded
            ? tileIds.map(tileId => <p key={tileId}>{openMarket[tileId].sellerName}</p>)
            : null}
        </section>
        <section className="dashboard__market-place__block">
          <h3 className="dashboard__market-place__subtitle">Property</h3>
          {state.loaded
            ? tileIds.map(tileId => <p key={tileId}>{openMarket[tileId].tileName}</p>)
            : null}
        </section>
        <section className="dashboard__market-place__block">
          <h3 className="dashboard__market-place__subtitle">Price</h3>
          {state.loaded
            ? tileIds.map(tileId => <p key={tileId}>{`$${openMarket[tileId].price}M`}</p>)
            : null}
        </section>
        <section className="dashboard__market-place__block">
          {state.loaded && canMutate
            ? tileIds.map(tileId => (
              <div key={tileId} className="dashboard__market-place__buttons">
                {openMarket[tileId].seller === playerId
                  ? (
                    <button
                      type="button"
                      aria-label={`Remove ${openMarket[tileId].tileName} from the market`}
                      onClick={() => socketFunctions.removeSale(tileId)}
                      className="dashboard__market-place__icon-x"
                    >
                      &#10060;
                    </button>
                  )
                  : (
                    <button
                      type="button"
                      aria-label={`Buy ${openMarket[tileId].tileName}`}
                      onClick={() => socketFunctions.makeSale(tileId)}
                      className="dashboard__market-place__icon-v"
                    >
                      &#10003;
                    </button>
                  )}
              </div>
            ))
            : null}
        </section>
      </section>
    </section>
  );
}
