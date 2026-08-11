import { randomUUID } from 'node:crypto';
import {
  tileState,
  type Auction,
  type AuctionId,
  type GameState,
  type PlayerId,
} from '@monopoly/shared';
import { sendToLog } from './text';
import { nextTurn } from './turn';

export const AUCTION_INITIAL_DURATION_MS = 30_000;
export const AUCTION_MIN_BID_WINDOW_MS = 15_000;

export interface StartAuctionOptions {
  auctionId?: AuctionId;
  // Supplying endsAt is useful when restoring or deterministically testing an
  // already-authoritative deadline. New auctions derive it from `now`.
  endsAt?: string;
  now?: number;
}

const activePlayerIds = (state: GameState): PlayerId[] => {
  const ordered = state.boardState.players.filter((id) => Boolean(state.players[id]));
  const known = new Set(ordered);
  return [
    ...ordered,
    ...Object.keys(state.players).filter((id) => !known.has(id)),
  ];
};

const validIsoDeadline = (value: string): boolean => Number.isFinite(Date.parse(value));

// Start an auction for the tile the current player declined to buy. The durable
// core stores an operation id and an absolute deadline; runtime timer handles and
// countdown ticks are projections owned by the transport layer.
export const startAuction = (
  state: GameState,
  tileID: number,
  options: StartAuctionOptions = {},
): Auction => {
  if (state.boardState.auction) return state.boardState.auction;

  const tile = tileState[tileID];
  if (!tile) throw new RangeError(`Unknown auction tile: ${tileID}`);

  const now = options.now ?? Date.now();
  const generatedEndsAt = new Date(now + AUCTION_INITIAL_DURATION_MS).toISOString();
  const endsAt = options.endsAt ?? generatedEndsAt;
  if (!validIsoDeadline(endsAt)) throw new RangeError('Auction endsAt must be a valid date.');

  const auction: Auction = {
    auctionId: options.auctionId ?? randomUUID(),
    tileID,
    tileName: tile.streetName,
    price: tile.price ?? 0,
    highestBid: 0,
    highestBidder: null,
    highestBidderName: null,
    active: activePlayerIds(state),
    passed: [],
    endsAt,
  };
  state.turnInfo.canBuyProp = false;
  state.boardState.auction = auction;
  sendToLog(state, `Auction started for ${tile.streetName}!`);
  return auction;
};

// A new bid guarantees at least another 15 seconds. Existing deadlines farther
// in the future are preserved, matching the previous "reset only below 15"
// behaviour without persisting a mutable countdown.
export const extendAuctionDeadline = (auction: Auction, now = Date.now()): string => {
  const minimumDeadline = now + AUCTION_MIN_BID_WINDOW_MS;
  const currentDeadline = Date.parse(auction.endsAt);
  if (!Number.isFinite(currentDeadline) || currentDeadline < minimumDeadline) {
    auction.endsAt = new Date(minimumDeadline).toISOString();
  }
  return auction.endsAt;
};

// Award the auctioned tile to its still-valid highest bidder, then pass the turn
// on. Supplying an expected id makes recovery callbacks stale-safe. Returning
// false means no matching live auction was changed.
export const finalizeAuction = (
  state: GameState,
  expectedAuctionId?: AuctionId,
): boolean => {
  const auction = state.boardState.auction;
  if (!auction) return false;
  if (expectedAuctionId && auction.auctionId !== expectedAuctionId) return false;

  const bidderId = auction.highestBidder;
  const bidder = bidderId ? state.players[bidderId] : undefined;
  const bidIsValid = Boolean(
    bidderId
    && bidder
    && auction.active.includes(bidderId)
    && Number.isInteger(auction.highestBid)
    && auction.highestBid > 0
    && bidder.accountBalance >= auction.highestBid,
  );
  const tileIsAvailable = !Object.prototype.hasOwnProperty.call(
    state.boardState.ownedProps,
    auction.tileID,
  );

  if (bidIsValid && tileIsAvailable && bidderId && bidder) {
    bidder.accountBalance -= auction.highestBid;
    state.boardState.ownedProps[auction.tileID] = {
      id: bidderId,
      color: bidder.color,
      houses: 0,
      mortgaged: false,
    };
    sendToLog(
      state,
      `${bidder.name} won the auction for ${auction.tileName} at $${auction.highestBid}M.`,
    );
  } else if (!tileIsAvailable) {
    sendToLog(state, `Auction for ${auction.tileName} was cancelled because it is already owned.`);
  } else {
    sendToLog(state, `No valid bids for ${auction.tileName}; it stays unowned.`);
  }

  state.boardState.auction = null;
  nextTurn(state);
  return true;
};
