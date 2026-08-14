import {
  tileState,
  type GameCardId,
  type GameState,
  type PlayerId,
  type TradeBundle,
} from '@monopoly/shared';
import { isPropertyLockedByLandingDecision } from './property';

export type PropertyTransferPolicy =
  | 'VOLUNTARY'
  | 'RETURN_TO_BANK'
  | 'BANK_PURCHASE'
  | 'FORCED_SALE';

export interface PropertyTransferResult {
  ok: boolean;
  mortgageInterest: number;
  reason?: string;
}

export const mortgageTransferInterest = (tileID: number): number => (
  Math.ceil(((tileState[tileID]?.price ?? 0) / 2) * 0.1)
);

export const invalidatePropertyCommerce = (state: GameState, tileID: number): void => {
  delete state.boardState.openMarket[tileID];
};

export const transferProperty = (
  state: GameState,
  tileID: number,
  fromPlayerId: PlayerId | null,
  toPlayerId: PlayerId | null,
  policy: PropertyTransferPolicy,
): PropertyTransferResult => {
  const property = state.boardState.ownedProps[tileID];
  if (fromPlayerId && (!property || property.id !== fromPlayerId)) {
    return { ok: false, mortgageInterest: 0, reason: 'Quyền sở hữu đã thay đổi.' };
  }
  if (policy === 'RETURN_TO_BANK') {
    invalidatePropertyCommerce(state, tileID);
    delete state.boardState.ownedProps[tileID];
    return { ok: true, mortgageInterest: 0 };
  }
  if (!toPlayerId || !state.players[toPlayerId]) {
    return { ok: false, mortgageInterest: 0, reason: 'Người nhận không còn trong ván.' };
  }

  if (isPropertyLockedByLandingDecision(state, tileID)) {
    return { ok: false, mortgageInterest: 0, reason: 'Tài sản đang chờ quyết định phát triển của lượt hiện tại.' };
  }

  if (!property) {
    if (policy !== 'BANK_PURCHASE') {
      return { ok: false, mortgageInterest: 0, reason: 'Tài sản không tồn tại.' };
    }
    state.boardState.ownedProps[tileID] = {
      id: toPlayerId,
      color: state.players[toPlayerId].color,
      houses: 0,
      mortgaged: false,
    };
    return { ok: true, mortgageInterest: 0 };
  }

  const interest = property.mortgaged ? mortgageTransferInterest(tileID) : 0;
  if (policy === 'VOLUNTARY' && state.players[toPlayerId].accountBalance < interest) {
    return { ok: false, mortgageInterest: interest, reason: 'Người nhận không đủ tiền trả lãi chuyển nhượng cầm cố.' };
  }
  invalidatePropertyCommerce(state, tileID);
  if (policy === 'VOLUNTARY') state.players[toPlayerId].accountBalance -= interest;
  if (policy === 'FORCED_SALE') property.mortgaged = false;
  property.id = toPlayerId;
  property.color = state.players[toPlayerId].color;
  return { ok: true, mortgageInterest: interest };
};

const ownsBundle = (state: GameState, playerId: PlayerId, bundle: TradeBundle): boolean => (
  bundle.propertyIds.every((tileID) => state.boardState.ownedProps[tileID]?.id === playerId)
  && bundle.jailFreeCardIds.every((cardId) => state.players[playerId]?.heldJailFreeCardIds.includes(cardId))
);

const transferCards = (
  state: GameState,
  fromPlayerId: PlayerId,
  toPlayerId: PlayerId,
  cardIds: GameCardId[],
): void => {
  const from = state.players[fromPlayerId];
  const to = state.players[toPlayerId];
  if (!from || !to) return;
  const moving = new Set(cardIds);
  from.heldJailFreeCardIds = from.heldJailFreeCardIds.filter((id) => !moving.has(id));
  to.heldJailFreeCardIds.push(...cardIds);
};

/** Atomically validate and apply a bilateral voluntary trade. */
export const executeVoluntaryTrade = (
  state: GameState,
  proposerId: PlayerId,
  recipientId: PlayerId,
  offered: TradeBundle,
  requested: TradeBundle,
): PropertyTransferResult => {
  if (state.boardState.paymentQueue) {
    return { ok: false, mortgageInterest: 0, reason: 'Không thể giao dịch trong lúc thanh toán thiếu hụt.' };
  }
  const lockedTile = state.turnInfo.pendingDevelopmentDecision?.tileID;
  if (
    lockedTile !== undefined
    && (offered.propertyIds.includes(lockedTile) || requested.propertyIds.includes(lockedTile))
  ) {
    return { ok: false, mortgageInterest: 0, reason: 'Tài sản đang chờ quyết định phát triển của lượt hiện tại.' };
  }
  const proposer = state.players[proposerId];
  const recipient = state.players[recipientId];
  if (!proposer || !recipient || !ownsBundle(state, proposerId, offered) || !ownsBundle(state, recipientId, requested)) {
    return { ok: false, mortgageInterest: 0, reason: 'Gói giao dịch đã lỗi thời.' };
  }
  const proposerInterest = requested.propertyIds.reduce(
    (sum, id) => sum + (state.boardState.ownedProps[id]?.mortgaged ? mortgageTransferInterest(id) : 0),
    0,
  );
  const recipientInterest = offered.propertyIds.reduce(
    (sum, id) => sum + (state.boardState.ownedProps[id]?.mortgaged ? mortgageTransferInterest(id) : 0),
    0,
  );
  if (proposer.accountBalance + requested.cash < offered.cash + proposerInterest) {
    return { ok: false, mortgageInterest: proposerInterest + recipientInterest, reason: 'Bên đề nghị không đủ tiền.' };
  }
  if (recipient.accountBalance + offered.cash < requested.cash + recipientInterest) {
    return { ok: false, mortgageInterest: proposerInterest + recipientInterest, reason: 'Bên nhận không đủ tiền.' };
  }

  proposer.accountBalance += requested.cash - offered.cash;
  recipient.accountBalance += offered.cash - requested.cash;
  for (const tileID of offered.propertyIds) transferProperty(state, tileID, proposerId, recipientId, 'VOLUNTARY');
  for (const tileID of requested.propertyIds) transferProperty(state, tileID, recipientId, proposerId, 'VOLUNTARY');
  transferCards(state, proposerId, recipientId, offered.jailFreeCardIds);
  transferCards(state, recipientId, proposerId, requested.jailFreeCardIds);
  return { ok: true, mortgageInterest: proposerInterest + recipientInterest };
};
