import { useContext, useEffect, useRef } from 'react';
import type { Tile } from '@monopoly/shared';
import { motion, useReducedMotion } from 'framer-motion';
import stateContext from '../internal';
import sellPromptContext from '../sellPromptContext';
import { formatMoney, getTileName } from '../presentation';
import './style/BackOfCard.css';

interface BackOfCardProps {
  id: number;
  tile: Tile;
  onClose: () => void;
  position: string;
}

interface TileDetail {
  label: string;
  value?: string;
}

function getTileDetails(tile: Tile): TileDetail[] {
  if (tile.tileType === 'normal') {
    const rentDetails = (tile.rentTiers ?? []).map((rent, index) => ({
      label: index === 4 ? 'Có Khách Sạn' : `Có ${index + 1} Nhà`,
      value: formatMoney(rent),
    }));
    return [
      ...(typeof tile.rent === 'number'
        ? [
          { label: 'Tiền thuê cơ bản', value: formatMoney(tile.rent) },
        ]
        : []),
      ...rentDetails,
      ...(typeof tile.houseCost === 'number'
        ? [{ label: 'Giá mỗi Nhà / Khách Sạn', value: formatMoney(tile.houseCost) }]
        : []),
      ...(typeof tile.price === 'number'
        ? [{ label: 'Giá trị cầm cố', value: formatMoney(Math.floor(tile.price / 2)) }]
        : []),
    ];
  }

  if (tile.tileType === 'railroad') {
    const rents = [25, 50, 100, 200].map((rent, index) => ({
      label: `Sở hữu ${index + 1} Ga Tàu`,
      value: formatMoney(rent),
    }));
    return [
      ...rents,
      ...(typeof tile.price === 'number'
        ? [{ label: 'Giá trị cầm cố', value: formatMoney(Math.floor(tile.price / 2)) }]
        : []),
    ];
  }

  if (tile.tileType === 'company') {
    return [
      { label: 'Sở hữu 1 Công Ty', value: 'Tổng xúc xắc ×4' },
      { label: 'Sở hữu cả 2 Công Ty', value: 'Tổng xúc xắc ×10' },
      ...(typeof tile.price === 'number'
        ? [{ label: 'Giá trị cầm cố', value: formatMoney(Math.floor(tile.price / 2)) }]
        : []),
    ];
  }

  if (tile.tileType === 'chance') {
    return [{ label: 'Rút thẻ Cơ Hội trên cùng và thực hiện nội dung trên thẻ.' }];
  }
  if (tile.tileType === 'chest') {
    return [{ label: 'Rút thẻ Khí Vận trên cùng và thực hiện nội dung trên thẻ.' }];
  }
  if (tile.tileType === 'start') {
    return [{ label: `Đi qua hoặc dừng tại đây nhận ${formatMoney(200)}.` }];
  }
  if (tile.tileType === 'jail') {
    return [{ label: 'Người đang thăm tù vẫn tiếp tục lượt bình thường.' }];
  }
  if (tile.tileType === 'gojail') {
    return [{ label: 'Đi thẳng vào Nhà Tù và không nhận tiền khi qua Xuất Phát.' }];
  }
  if (tile.tileType === 'parking') {
    return [{ label: 'Không nhận thưởng; lượt chơi tiếp tục theo luật thông thường.' }];
  }
  return [];
}

const BackOfCard = ({
  id, tile, onClose, position,
}: BackOfCardProps) => {
  const {
    state, playerId, socketFunctions, canMutate,
  } = useContext(stateContext);
  const { handlePutOpenMarket, handleMakeOffer } = useContext(sellPromptContext);
  const reduced = useReducedMotion() ?? false;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const owned = state.boardState.ownedProps[id];
  const name = getTileName(id);
  const details = getTileDetails(tile);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Development is landing-bound; this panel only exposes local sale and
  // mortgage actions. The server remains authoritative for every command.
  const isStreet = tile.tileType === 'normal' && typeof tile.houseCost === 'number';
  const myBalance = typeof playerId === 'string'
    ? state.players[playerId]?.accountBalance ?? 0
    : 0;
  const houses = owned?.houses ?? 0;
  const isMortgaged = !!owned?.mortgaged;
  const mortgageValue = Math.floor((tile.price ?? 0) / 2);
  const unmortgageCost = Math.ceil(mortgageValue * 1.1);

  const canSellHouse = isStreet && houses > 0;
  const canMortgage = !isMortgaged && houses === 0;
  const canUnmortgage = isMortgaged && myBalance >= unmortgageCost;

  const sellHouseTitle = (() => {
    if (canSellHouse) return 'Bán một Nhà về Ngân hàng';
    if (houses === 0) return 'Tài sản không có Nhà để bán';
    return 'Tài sản không có Nhà để bán';
  })();
  const mortgageTitle = (() => {
    if (canMortgage) return `Cầm cố để nhận ${formatMoney(mortgageValue)}`;
    if (houses > 0) return 'Phải bán hết công trình trên tài sản trước';
    return 'Tài sản đã được cầm cố';
  })();
  const unmortgageTitle = canUnmortgage
    ? `Chuộc tài sản với giá ${formatMoney(unmortgageCost)}`
    : `Cần ${formatMoney(unmortgageCost)} để chuộc tài sản`;

  return (
    <motion.div
      className="tile-back--container"
      initial={reduced ? { opacity: 0 } : { rotateY: -90, opacity: 0 }}
      animate={reduced ? { opacity: 1 } : { rotateY: 0, opacity: 1 }}
      transition={reduced ? { duration: 0 } : { duration: 0.35, ease: 'easeOut' }}
      style={{ transformPerspective: 600 }}
    >
      <article
        role="dialog"
        aria-labelledby={`tile-detail-title-${id}`}
        className={`Tile-back tile-back__${position}`}
      >
        <button
          ref={closeButtonRef}
          className="tile-back__close"
          type="button"
          aria-label={`Đóng chi tiết ${name}`}
          onClick={onClose}
        >
          ×
        </button>
        <h2
          id={`tile-detail-title-${id}`}
          className="tile-back__name"
          style={tile.color ? { backgroundColor: tile.color } : undefined}
        >
          {name}
        </h2>
        {typeof tile.price === 'number'
          ? <p className="tile-back__prices">Giá mua: {formatMoney(tile.price)}</p>
          : null}
        <span className="tile-back__line" aria-hidden="true" />
        <div className="tile-back__details-list">
          {details.map(detail => (
            <p className="tile-back__details--wrapper" key={`${detail.label}-${detail.value ?? ''}`}>
              <span className="tile-back__details">{detail.label}</span>
              {detail.value
                ? <span className="tile-back__details--price">{detail.value}</span>
                : null}
            </p>
          ))}
        </div>
        {isMortgaged ? <p className="tile-back__mortgaged">ĐANG CẦM CỐ</p> : null}
        {owned && houses > 0
          ? (
            <p className="tile-back__houses">
              {houses === 5 ? '🏨 1 Khách Sạn' : `🏠 ${houses} Nhà`}
            </p>
          )
          : null}
        {owned && canMutate
          ? owned.id !== playerId
            ? (
              <div className="tile-back__buttons">
                <button
                  type="button"
                  onClick={() => handleMakeOffer(id)}
                  className="tile-back__button"
                >
                  Đề nghị mua
                </button>
              </div>
            )
            : (
              <div className="tile-back__buttons">
                {isStreet && !isMortgaged
                  ? (
                    <>
                      <button type="button" disabled={!canSellHouse} title={sellHouseTitle} onClick={() => socketFunctions.sellHouse(id)} className="tile-back__button">Bán Nhà</button>
                    </>
                  )
                  : null}
                {isMortgaged
                  ? <button type="button" disabled={!canUnmortgage} title={unmortgageTitle} onClick={() => socketFunctions.unmortgageProperty(id)} className="tile-back__button">Chuộc tài sản</button>
                  : <button type="button" disabled={!canMortgage} title={mortgageTitle} onClick={() => socketFunctions.mortgageProperty(id)} className="tile-back__button">Cầm cố</button>}
                <button type="button" title="Đăng bán trên thị trường" onClick={() => handlePutOpenMarket(id)} className="tile-back__button">Đăng bán</button>
              </div>
            )
          : null}
      </article>
    </motion.div>
  );
};

export default BackOfCard;
