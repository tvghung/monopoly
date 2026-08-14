import { useContext } from 'react';
import stateContext from '../internal';
import {
  formatMoney,
  getMortgageTransferSurcharge,
  getTileName,
} from '../presentation';
import PropertyCard from '../game/ui/property/PropertyCard';
import './style/MarketPlace.css';

export default function MarketPlace() {
  const {
    socketFunctions, state, playerId, canMutate,
  } = useContext(stateContext);
  const { openMarket, ownedProps } = state.boardState;
  const tileIds = Object.keys(openMarket).map(Number);

  return (
    <section className="dashboard__market-place--container">
      <h2 className="dashboard__market-place__title">Thị trường tài sản</h2>
      {state.loaded && tileIds.length === 0
        ? <p className="dashboard__market-place__empty">Chưa có tài sản nào được đăng bán.</p>
        : null}
      <div className="dashboard__market-place" role="list">
        {state.loaded
          ? tileIds.map(tileId => {
            const listing = openMarket[tileId];
            const mortgaged = !!ownedProps[tileId]?.mortgaged;
            const surcharge = mortgaged ? getMortgageTransferSurcharge(tileId) : 0;
            const total = listing.price + surcharge;
            const isSeller = listing.seller === playerId;

            return (
              <PropertyCard className="market-listing" role="listitem" key={tileId} tileId={tileId} ownedProp={ownedProps[tileId]}>
                <div>
                  <p>Người bán: {listing.sellerName}</p>
                </div>
                <div className="market-listing__price">
                  <p>Giá bán: <strong>{formatMoney(listing.price)}</strong></p>
                  {mortgaged
                    ? (
                      <p className="market-listing__mortgage">
                        <strong>Đang cầm cố</strong>
                        {' — '}
                        người mua trả thêm {formatMoney(surcharge)} lãi chuyển nhượng
                        (10% giá trị cầm cố). Tổng thanh toán: {formatMoney(total)}.
                      </p>
                    )
                    : <p>Tổng thanh toán: {formatMoney(total)}.</p>}
                </div>
                {canMutate
                  ? isSeller
                    ? (
                      <button
                        type="button"
                        aria-label={`Gỡ ${getTileName(tileId)} khỏi thị trường`}
                        onClick={() => socketFunctions.removeSale(tileId)}
                        className="dashboard__market-place__icon-x"
                      >
                        <span aria-hidden="true">✕</span>
                        <span>Gỡ tin</span>
                      </button>
                    )
                    : (
                      <button
                        type="button"
                        aria-label={`Mua ${getTileName(tileId)}, tổng thanh toán ${formatMoney(total)}`}
                        onClick={() => socketFunctions.makeSale(tileId)}
                        className="dashboard__market-place__icon-v"
                      >
                        <span aria-hidden="true">✓</span>
                        <span>Mua</span>
                      </button>
                    )
                  : null}
              </PropertyCard>
            );
          })
          : null}
      </div>
    </section>
  );
}
