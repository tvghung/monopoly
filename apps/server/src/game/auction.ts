import { randomUUID } from 'node:crypto';
import {
  tileState,
  type Auction,
  type AuctionId,
  type BuildingAuction,
  type BuildingRequest,
  type BuildingType,
  type GameState,
  type PendingTurnContinuation,
  type PlayerId,
  type PropertyAuction,
} from '@monopoly/shared';
import { bankBuildingInventory, buildHouse } from './property';
import { settleAffordableClaims } from './payment';
import { sendToLog } from './text';
import { checkWinner, completeTurnResolution } from './turn';
import { transferProperty } from './transfer';
import { resumePaymentContinuation } from './tiles';

export const AUCTION_INITIAL_DURATION_MS = 30_000;
export const AUCTION_MIN_BID_WINDOW_MS = 15_000;
export const BUILDING_CONTENTION_DURATION_MS = 10_000;

export interface StartAuctionOptions {
  auctionId?: AuctionId;
  endsAt?: string;
  now?: number;
  source?: PropertyAuction['source'];
  continuation?: PendingTurnContinuation | null;
  participants?: PlayerId[];
}

const activePlayerIds = (state: GameState): PlayerId[] => {
  const ordered = state.boardState.players.filter((id) => Boolean(state.players[id]));
  const known = new Set(ordered);
  return [...ordered, ...Object.keys(state.players).filter((id) => !known.has(id))];
};

const validIsoDeadline = (value: string): boolean => Number.isFinite(Date.parse(value));

export const startAuction = (
  state: GameState,
  tileID: number,
  options: StartAuctionOptions = {},
): Auction => {
  if (state.boardState.auction) return state.boardState.auction;
  const tile = tileState[tileID];
  if (!tile) throw new RangeError(`Unknown auction tile: ${tileID}`);
  const now = options.now ?? Date.now();
  const endsAt = options.endsAt ?? new Date(now + AUCTION_INITIAL_DURATION_MS).toISOString();
  if (!validIsoDeadline(endsAt)) throw new RangeError('Auction endsAt must be a valid date.');
  const auction: PropertyAuction = {
    kind: 'PROPERTY',
    auctionId: options.auctionId ?? randomUUID(),
    tileID,
    tileName: tile.streetName,
    price: tile.price ?? 0,
    source: options.source ?? 'DECLINED_PURCHASE',
    highestBid: 0,
    highestBidder: null,
    highestBidderName: null,
    active: options.participants ?? activePlayerIds(state),
    passed: [],
    endsAt,
    continuation: options.continuation !== undefined
      ? options.continuation
      : state.turnInfo.pendingPropertyDecision?.continuation ?? null,
  };
  if (auction.source === 'DECLINED_PURCHASE') {
    delete state.turnInfo.pendingPropertyDecision;
  }
  state.boardState.auction = auction;
  sendToLog(state, `Bắt đầu đấu giá ${tile.streetName}.`);
  return auction;
};

export const startBuildingAuction = (
  state: GameState,
  buildingType: BuildingType,
  requests: Record<PlayerId, BuildingRequest>,
  options: StartAuctionOptions = {},
): BuildingAuction => {
  if (state.boardState.auction) throw new Error('Một phiên đấu giá khác đang diễn ra.');
  const participants = Object.keys(requests).filter((id) => Boolean(state.players[id]));
  const now = options.now ?? Date.now();
  const auction: BuildingAuction = {
    kind: 'BUILDING',
    buildingType,
    requests,
    minimumBid: 1,
    auctionId: options.auctionId ?? randomUUID(),
    highestBid: 0,
    highestBidder: null,
    highestBidderName: null,
    active: participants,
    passed: [],
    endsAt: options.endsAt ?? new Date(now + AUCTION_INITIAL_DURATION_MS).toISOString(),
    continuation: options.continuation ?? null,
  };
  state.boardState.auction = auction;
  state.boardState.buildingContention = null;
  sendToLog(state, `Bắt đầu đấu giá ${buildingType === 'HOUSE' ? 'Nhà' : 'Khách Sạn'} cuối cùng.`);
  return auction;
};

export const extendAuctionDeadline = (auction: Auction, now = Date.now()): string => {
  const minimumDeadline = now + AUCTION_MIN_BID_WINDOW_MS;
  const currentDeadline = Date.parse(auction.endsAt);
  if (!Number.isFinite(currentDeadline) || currentDeadline < minimumDeadline) {
    auction.endsAt = new Date(minimumDeadline).toISOString();
  }
  return auction.endsAt;
};

const finishBankQueueTile = (state: GameState, auction: PropertyAuction): void => {
  const queue = state.boardState.bankPropertyAuctionQueue;
  if (!queue || queue.currentAuctionId !== auction.auctionId || queue.currentTileId !== auction.tileID) return;
  queue.currentAuctionId = null;
  queue.currentTileId = null;
};

export const startNextBankPropertyAuction = (
  state: GameState,
  options: StartAuctionOptions = {},
): Auction | null => {
  const queue = state.boardState.bankPropertyAuctionQueue;
  if (
    !queue
    || state.boardState.auction
    || state.boardState.buildingContention
    || queue.currentAuctionId
  ) return state.boardState.auction ?? null;
  const tileID = queue.orderedRemainingTileIds.shift();
  if (tileID === undefined) {
    const continuation = queue.continuation;
    state.boardState.bankPropertyAuctionQueue = null;
    const paymentContinuation = state.boardState.paymentQueue
      ? settleAffordableClaims(state)
      : null;
    if (paymentContinuation) resumePaymentContinuation(state, paymentContinuation);
    else completeTurnResolution(state, continuation);
    if (!state.boardState.paymentQueue) checkWinner(state);
    return null;
  }
  const auction = startAuction(state, tileID, {
    ...options,
    source: 'BANKRUPTCY',
    continuation: null,
  });
  queue.currentTileId = tileID;
  queue.currentAuctionId = auction.auctionId;
  return auction;
};

export const finalizeAuction = (
  state: GameState,
  expectedAuctionId?: AuctionId,
): boolean => {
  const auction = state.boardState.auction;
  if (!auction || (expectedAuctionId && auction.auctionId !== expectedAuctionId)) return false;
  const bidderId = auction.highestBidder;
  const bidder = bidderId ? state.players[bidderId] : undefined;
  const bidIsValid = Boolean(
    bidderId && bidder && auction.active.includes(bidderId)
    && Number.isInteger(auction.highestBid) && auction.highestBid > 0
    && bidder.accountBalance >= auction.highestBid,
  );
  let awarded = false;

  if (auction.kind === 'PROPERTY') {
    const tileIsAvailable = !state.boardState.ownedProps[auction.tileID];
    if (bidIsValid && tileIsAvailable && bidderId && bidder) {
      bidder.accountBalance -= auction.highestBid;
      awarded = transferProperty(state, auction.tileID, null, bidderId, 'BANK_AUCTION_AWARD').ok;
      if (awarded) sendToLog(state, `${bidder.name} thắng đấu giá ${auction.tileName} với ${auction.highestBid.toLocaleString('vi-VN')}.000 ₫.`);
    }
    if (!awarded) sendToLog(state, `Không có giá hợp lệ cho ${auction.tileName}; tài sản vẫn thuộc Ngân hàng.`);
    finishBankQueueTile(state, auction);
  } else if (bidIsValid && bidderId && bidder) {
    const request = auction.requests[bidderId];
    // Release the auction's physical reservation while applying the winning
    // build. No other command can interleave inside this serialized mutation.
    state.boardState.auction = null;
    const inventory = bankBuildingInventory(state);
    const stockAvailable = auction.buildingType === 'HOUSE'
      ? inventory.housesAvailable > 0
      : inventory.hotelsAvailable > 0;
    if (request && stockAvailable && bidder.accountBalance >= auction.highestBid) {
      const listCost = tileState[request.tileID]?.houseCost ?? 0;
      const before = bidder.accountBalance;
      bidder.accountBalance = before + listCost;
      if (buildHouse(state, bidderId, request.tileID)) {
        bidder.accountBalance -= auction.highestBid;
        awarded = true;
      } else {
        bidder.accountBalance = before;
      }
    }
    if (!awarded) sendToLog(state, 'Người trả giá cao nhất không còn hợp lệ; phiên đấu giá công trình bị hủy.');
  }

  const continuation = auction.continuation;
  state.boardState.auction = null;
  if (state.boardState.bankPropertyAuctionQueue) {
    if (continuation) state.boardState.bankPropertyAuctionQueue.continuation = continuation;
    startNextBankPropertyAuction(state);
  }
  else if (continuation) completeTurnResolution(state, continuation);
  return true;
};
