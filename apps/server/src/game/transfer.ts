import {
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
  reason?: string;
}

export const transferProperty = (
  state: GameState,
  tileID: number,
  fromPlayerId: PlayerId | null,
  toPlayerId: PlayerId | null,
  policy: PropertyTransferPolicy,
): PropertyTransferResult => {
  const property = state.boardState.ownedProps[tileID];
  if (fromPlayerId && (!property || property.id !== fromPlayerId)) {
    return { ok: false, reason: 'Quyền sở hữu đã thay đổi.' };
  }
  if (policy === 'RETURN_TO_BANK') {
    delete state.boardState.ownedProps[tileID];
    return { ok: true };
  }
  if (!toPlayerId || !state.players[toPlayerId]) {
    return { ok: false, reason: 'Người nhận không còn trong ván.' };
  }

  if (isPropertyLockedByLandingDecision(state, tileID)) {
    return { ok: false, reason: 'Tài sản đang chờ quyết định phát triển của lượt hiện tại.' };
  }

  if (!property) {
    if (policy !== 'BANK_PURCHASE') {
      return { ok: false, reason: 'Tài sản không tồn tại.' };
    }
    state.boardState.ownedProps[tileID] = {
      id: toPlayerId,
      color: state.players[toPlayerId].color,
      houses: 0,
    };
    return { ok: true };
  }

  property.id = toPlayerId;
  property.color = state.players[toPlayerId].color;
  return { ok: true };
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
    return { ok: false, reason: 'Không thể giao dịch trong lúc thanh toán thiếu hụt.' };
  }
  const lockedTile = state.turnInfo.pendingDevelopmentDecision?.tileID;
  if (
    lockedTile !== undefined
    && (offered.propertyIds.includes(lockedTile) || requested.propertyIds.includes(lockedTile))
  ) {
    return { ok: false, reason: 'Tài sản đang chờ quyết định phát triển của lượt hiện tại.' };
  }
  const proposer = state.players[proposerId];
  const recipient = state.players[recipientId];
  if (!proposer || !recipient || !ownsBundle(state, proposerId, offered) || !ownsBundle(state, recipientId, requested)) {
    return { ok: false, reason: 'Gói giao dịch đã lỗi thời.' };
  }
  if (proposer.accountBalance + requested.cash < offered.cash) {
    return { ok: false, reason: 'Bên đề nghị không đủ tiền.' };
  }
  if (recipient.accountBalance + offered.cash < requested.cash) {
    return { ok: false, reason: 'Bên nhận không đủ tiền.' };
  }

  proposer.accountBalance += requested.cash - offered.cash;
  recipient.accountBalance += offered.cash - requested.cash;
  for (const tileID of offered.propertyIds) transferProperty(state, tileID, proposerId, recipientId, 'VOLUNTARY');
  for (const tileID of requested.propertyIds) transferProperty(state, tileID, recipientId, proposerId, 'VOLUNTARY');
  transferCards(state, proposerId, recipientId, offered.jailFreeCardIds);
  transferCards(state, recipientId, proposerId, requested.jailFreeCardIds);
  return { ok: true };
};
