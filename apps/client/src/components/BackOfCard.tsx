import { useContext, useEffect, useRef } from 'react';
import type { Tile } from '@monopoly/shared';
import { motion, useReducedMotion } from 'framer-motion';
import stateContext from '../internal';
import tradePromptContext from '../tradePromptContext';
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
    ];
  }

  if (tile.tileType === 'railroad') {
    const rents = [25, 50, 100, 200].map((rent, index) => ({
      label: `Sở hữu ${index + 1} Ga Tàu`,
      value: formatMoney(rent),
    }));
    return [
      ...rents,
    ];
  }

  if (tile.tileType === 'company') {
    return [
      { label: 'Sở hữu 1 Công Ty', value: 'Tổng xúc xắc ×4' },
      { label: 'Sở hữu cả 2 Công Ty', value: 'Tổng xúc xắc ×10' },
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
  const { openTradeForProperty } = useContext(tradePromptContext);
  const reduced = useReducedMotion() ?? false;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const owned = state.boardState.ownedProps[id];
  const name = getTileName(id);
  const details = getTileDetails(tile);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Development is landing-bound; this panel only exposes direct trade and
  // local building actions. The server remains authoritative for every command.
  const isStreet = tile.tileType === 'normal' && typeof tile.houseCost === 'number';
  const houses = owned?.houses ?? 0;

  const canSellHouse = isStreet && houses > 0;

  const sellHouseTitle = (() => {
    if (canSellHouse) return 'Bán một Nhà về Ngân hàng';
    if (houses === 0) return 'Tài sản không có Nhà để bán';
    return 'Tài sản không có Nhà để bán';
  })();
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
                  onClick={() => openTradeForProperty(id)}
                  className="tile-back__button"
                >
                  Đề nghị mua
                </button>
              </div>
            )
            : (
              <div className="tile-back__buttons">
                {isStreet
                  ? (
                    <>
                      <button type="button" disabled={!canSellHouse} title={sellHouseTitle} onClick={() => socketFunctions.sellHouse(id)} className="tile-back__button">Bán Nhà</button>
                    </>
                  )
                  : null}
              </div>
            )
          : null}
      </article>
    </motion.div>
  );
};

export default BackOfCard;
