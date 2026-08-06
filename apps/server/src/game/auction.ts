import { tileState, type GameState } from '@monopoly/shared';
import { sendToLog } from './text';
import { nextTurn } from './turn';

// Start an auction for the tile the current player declined to buy.
export const startAuction = (state: GameState, tileID: number): void => {
  const tile = tileState[tileID];
  state.turnInfo.canBuyProp = false;
  state.boardState.auction = {
    tileID,
    tileName: tile.streetName,
    price: tile.price ?? 0,
    highestBid: 0,
    highestBidder: null,
    highestBidderName: null,
    active: Object.keys(state.players),
    passed: [],
    timer: 30,
  };
  sendToLog(state, `Auction started for ${tile.streetName}!`);
};

// Award the auctioned tile to the highest bidder (if any) and pass the turn on.
export const finalizeAuction = (state: GameState): void => {
  const auction = state.boardState.auction;
  if (!auction) return;
  if (auction.highestBidder && auction.highestBid > 0 && state.players[auction.highestBidder]) {
    const winner = state.players[auction.highestBidder];
    winner.accountBalance -= auction.highestBid;
    state.boardState.ownedProps[auction.tileID] = {
      id: auction.highestBidder,
      color: winner.color,
      houses: 0,
      mortgaged: false,
    };
    sendToLog(state, `${auction.highestBidderName} won the auction for ${auction.tileName} at $${auction.highestBid}M.`);
  } else {
    sendToLog(state, `No bids for ${auction.tileName}; it stays unowned.`);
  }
  state.boardState.auction = null;
  nextTurn(state);
};
